# API Document — Quanlycongviec (Tủ Bếp Pro)

Tài liệu **đầy đủ** các HTTP endpoint được khai báo trong Express routes.

- Cập nhật: **2026-08-20**
- Số mount `/api/*` trong `server.js`: **74**
- Số endpoint (method + path) quét được: **1440**
- Nguồn: `backend/src/server.js` + `backend/src/routes/**/*.js`
- Regenerate: `node docs/api/generate-api-doc.js`

> Path đầy đủ = mount prefix + path trong `router.get/post/...`. Một số router mount nested (vd. CRM clusters dưới `/api/crm`).

---

## 1. Auth

| Mode | Header | Phạm vi |
|---|---|---|
| JWT | `Authorization: Bearer <token>` | App nội bộ |
| API Key | `X-Api-Key` | `/api/external` |
| API Key + User | `X-Api-Key` + `X-User-Id` | `/api/mcp` |

Middleware: `auth.js`, `newPermission.js`, `apiKeyAuth.js`. Client: `frontend/src/lib/api.js`.

---

## 2. Danh sách mount (`server.js`)

- `/api`
- `/api/accounting`
- `/api/admin/supabase`
- `/api/ai-chat-bot`
- `/api/app-modules`
- `/api/app-updates`
- `/api/app-updates/check`
- `/api/app-updates/manifest`
- `/api/approvals`
- `/api/assistant`
- `/api/auth`
- `/api/auth-events`
- `/api/batch-jobs`
- `/api/calc`
- `/api/companies`
- `/api/company-processes`
- `/api/company-templates`
- `/api/crm`
- `/api/crm/assignments`
- `/api/crm/daily-reports`
- `/api/crm/deal-performance`
- `/api/crm/dept-plans`
- `/api/crm/executive`
- `/api/customers`
- `/api/dashboard`
- `/api/dashboard-main`
- `/api/departments`
- `/api/devices`
- `/api/divisions`
- `/api/drive`
- `/api/ecosystem`
- `/api/events`
- `/api/external`
- `/api/facebook`
- `/api/flows`
- `/api/heartbeat`
- `/api/integrations/stringee`
- `/api/internal-social`
- `/api/knowledge`
- `/api/kpi`
- `/api/logistics`
- `/api/management`
- `/api/mcp`
- `/api/messenger`
- `/api/permissions`
- `/api/platform`
- `/api/procurement`
- `/api/production`
- `/api/production/backup-sync`
- `/api/products`
- `/api/projects`
- `/api/purchasing`
- `/api/push`
- `/api/release-notes`
- `/api/saas`
- `/api/saas/payment`
- `/api/settings`
- `/api/stages`
- `/api/tasks`
- `/api/teams`
- `/api/templates`
- `/api/tenant`
- `/api/trash`
- `/api/turn`
- `/api/upload`
- `/api/user-activity`
- `/api/users`
- `/api/vc-handover`
- `/api/voice-recordings`
- `/api/work-tasks`
- `/api/workshop`
- `/api/workshop-teams`
- `/api/zalo`
- `/api/zalo/webhook`

---

## 3. Toàn bộ endpoints theo prefix

### `/api/accounting` (20)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/accounting/bank-accounts` | `accounting.js` |
| POST | `/api/accounting/bank-accounts` | `accounting.js` |
| DELETE | `/api/accounting/bank-accounts/:id` | `accounting.js` |
| PUT | `/api/accounting/bank-accounts/:id` | `accounting.js` |
| GET | `/api/accounting/deals` | `accounting.js` |
| GET | `/api/accounting/deals/:leadId` | `accounting.js` |
| PUT | `/api/accounting/deals/:leadId/deposit` | `accounting.js` |
| GET | `/api/accounting/deals/:leadId/payment-stages` | `accounting.js` |
| POST | `/api/accounting/deals/:leadId/payment-stages` | `accounting.js` |
| DELETE | `/api/accounting/deals/:leadId/payment-stages/:stageId` | `accounting.js` |
| PUT | `/api/accounting/deals/:leadId/payment-stages/:stageId` | `accounting.js` |
| GET | `/api/accounting/deals/:leadId/payments` | `accounting.js` |
| POST | `/api/accounting/deals/:leadId/payments` | `accounting.js` |
| DELETE | `/api/accounting/deals/:leadId/payments/:paymentId` | `accounting.js` |
| PUT | `/api/accounting/deals/:leadId/sync-value` | `accounting.js` |
| GET | `/api/accounting/export` | `accounting.js` |
| GET | `/api/accounting/me` | `accounting.js` |
| GET | `/api/accounting/regions` | `accounting.js` |
| GET | `/api/accounting/summary` | `accounting.js` |
| GET | `/api/accounting/workshops` | `accounting.js` |

### `/api/admin/supabase` (4)

| Method | Path đầy đủ | File |
|---|---|---|
| POST | `/api/admin/supabase/failback` | `supabaseOps.js` |
| GET | `/api/admin/supabase/failback/status` | `supabaseOps.js` |
| GET | `/api/admin/supabase/status` | `supabaseOps.js` |
| POST | `/api/admin/supabase/switch` | `supabaseOps.js` |

### `/api/ai-chat-bot` (37)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/ai-chat-bot/bot` | `aiChatBot.js` |
| GET | `/api/ai-chat-bot/channel-filters` | `aiChatBot.js` |
| GET | `/api/ai-chat-bot/channels` | `aiChatBot.js` |
| POST | `/api/ai-chat-bot/ensure-direct-with-bot` | `aiChatBot.js` |
| GET | `/api/ai-chat-bot/io` | `aiChatBot.js` |
| GET | `/api/ai-chat-bot/memory` | `aiChatBot.js` |
| GET | `/api/ai-chat-bot/memory/:userId/facts` | `aiChatBot.js` |
| POST | `/api/ai-chat-bot/memory/facts` | `aiChatBot.js` |
| DELETE | `/api/ai-chat-bot/memory/facts/:id` | `aiChatBot.js` |
| POST | `/api/ai-chat-bot/memory/rebuild` | `aiChatBot.js` |
| POST | `/api/ai-chat-bot/memory/rebuild/:userId` | `aiChatBot.js` |
| GET | `/api/ai-chat-bot/playbooks` | `aiChatBot.js` |
| POST | `/api/ai-chat-bot/playbooks` | `aiChatBot.js` |
| DELETE | `/api/ai-chat-bot/playbooks/:id` | `aiChatBot.js` |
| PUT | `/api/ai-chat-bot/playbooks/:id` | `aiChatBot.js` |
| PATCH | `/api/ai-chat-bot/playbooks/:id/toggle` | `aiChatBot.js` |
| GET | `/api/ai-chat-bot/proposals` | `aiChatBot.js` |
| POST | `/api/ai-chat-bot/proposals/:id/approve` | `aiChatBot.js` |
| POST | `/api/ai-chat-bot/proposals/:id/reject` | `aiChatBot.js` |
| GET | `/api/ai-chat-bot/schedules` | `aiChatBot.js` |
| POST | `/api/ai-chat-bot/schedules` | `aiChatBot.js` |
| DELETE | `/api/ai-chat-bot/schedules/:id` | `aiChatBot.js` |
| PUT | `/api/ai-chat-bot/schedules/:id` | `aiChatBot.js` |
| POST | `/api/ai-chat-bot/schedules/:id/run-now` | `aiChatBot.js` |
| GET | `/api/ai-chat-bot/schedules/:id/runs` | `aiChatBot.js` |
| PATCH | `/api/ai-chat-bot/schedules/:id/toggle` | `aiChatBot.js` |
| GET | `/api/ai-chat-bot/skills` | `aiChatBot.js` |
| POST | `/api/ai-chat-bot/skills` | `aiChatBot.js` |
| DELETE | `/api/ai-chat-bot/skills/:id` | `aiChatBot.js` |
| PUT | `/api/ai-chat-bot/skills/:id` | `aiChatBot.js` |
| PATCH | `/api/ai-chat-bot/skills/:id/toggle` | `aiChatBot.js` |
| GET | `/api/ai-chat-bot/skills/library` | `aiChatBot.js` |
| GET | `/api/ai-chat-bot/skills/library/file/:name` | `aiChatBot.js` |
| PUT | `/api/ai-chat-bot/skills/library/file/:name` | `aiChatBot.js` |
| POST | `/api/ai-chat-bot/skills/library/reload` | `aiChatBot.js` |
| GET | `/api/ai-chat-bot/task-flows` | `aiChatBot.js` |
| GET | `/api/ai-chat-bot/users` | `aiChatBot.js` |

### `/api/app-modules` (43)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/app-modules/` | `appModules.js` |
| POST | `/api/app-modules/` | `appModules.js` |
| DELETE | `/api/app-modules/:moduleKey` | `appModules.js` |
| GET | `/api/app-modules/:moduleKey` | `appModules.js` |
| PUT | `/api/app-modules/:moduleKey` | `appModules.js` |
| GET | `/api/app-modules/:moduleKey/records` | `appModules.js` |
| POST | `/api/app-modules/:moduleKey/records` | `appModules.js` |
| DELETE | `/api/app-modules/:moduleKey/records/:recordId` | `appModules.js` |
| GET | `/api/app-modules/:moduleKey/records/:recordId` | `appModules.js` |
| PUT | `/api/app-modules/:moduleKey/records/:recordId` | `appModules.js` |
| POST | `/api/app-modules/:moduleKey/records/:recordId/move-tab` | `appModules.js` |
| GET | `/api/app-modules/:moduleKey/records/:recordId/tasks` | `appModules.js` |
| POST | `/api/app-modules/:moduleKey/records/:recordId/tasks` | `appModules.js` |
| POST | `/api/app-modules/:moduleKey/records/:recordId/tasks/ensure-missing` | `appModules.js` |
| POST | `/api/app-modules/:moduleKey/records/:recordId/tasks/from-template` | `appModules.js` |
| POST | `/api/app-modules/:moduleKey/records/:recordId/transfer` | `appModules.js` |
| GET | `/api/app-modules/:moduleKey/stages` | `appModules.js` |
| POST | `/api/app-modules/:moduleKey/stages` | `appModules.js` |
| PUT | `/api/app-modules/:moduleKey/stages-reorder` | `appModules.js` |
| DELETE | `/api/app-modules/:moduleKey/stages/:stageId` | `appModules.js` |
| PUT | `/api/app-modules/:moduleKey/stages/:stageId` | `appModules.js` |
| GET | `/api/app-modules/:moduleKey/tabs` | `appModules.js` |
| POST | `/api/app-modules/:moduleKey/tabs` | `appModules.js` |
| DELETE | `/api/app-modules/:moduleKey/tabs/:tabId` | `appModules.js` |
| PUT | `/api/app-modules/:moduleKey/tabs/:tabId` | `appModules.js` |
| GET | `/api/app-modules/:moduleKey/task-templates` | `appModules.js` |
| POST | `/api/app-modules/:moduleKey/task-templates` | `appModules.js` |
| PUT | `/api/app-modules/:moduleKey/task-templates-reorder` | `appModules.js` |
| DELETE | `/api/app-modules/:moduleKey/task-templates/:templateId` | `appModules.js` |
| PUT | `/api/app-modules/:moduleKey/task-templates/:templateId` | `appModules.js` |
| POST | `/api/app-modules/:moduleKey/task-templates/:templateId/items` | `appModules.js` |
| PUT | `/api/app-modules/:moduleKey/task-templates/:templateId/items-reorder` | `appModules.js` |
| DELETE | `/api/app-modules/:moduleKey/task-templates/:templateId/items/:itemId` | `appModules.js` |
| PUT | `/api/app-modules/:moduleKey/task-templates/:templateId/items/:itemId` | `appModules.js` |
| DELETE | `/api/app-modules/:moduleKey/tasks/:taskId` | `appModules.js` |
| PUT | `/api/app-modules/:moduleKey/tasks/:taskId` | `appModules.js` |
| POST | `/api/app-modules/:moduleKey/transfer-from-crm` | `appModules.js` |
| GET | `/api/app-modules/known-keys` | `appModules.js` |
| GET | `/api/app-modules/links` | `appModules.js` |
| PUT | `/api/app-modules/links` | `appModules.js` |
| GET | `/api/app-modules/links/by-stages` | `appModules.js` |
| POST | `/api/app-modules/links/by-stages` | `appModules.js` |
| POST | `/api/app-modules/notify-from-crm-stage` | `appModules.js` |

### `/api/app-updates` (18)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/app-updates/apps` | `appUpdates.js` |
| POST | `/api/app-updates/apps` | `appUpdates.js` |
| PUT | `/api/app-updates/apps/:appId` | `appUpdates.js` |
| GET | `/api/app-updates/apps/:appId/releases` | `appUpdates.js` |
| POST | `/api/app-updates/apps/:appId/releases` | `appUpdates.js` |
| PUT | `/api/app-updates/apps/:appId/scan-dir` | `appUpdates.js` |
| GET | `/api/app-updates/apps/:appId/scan-files` | `appUpdates.js` |
| POST | `/api/app-updates/apps/:appId/scan-import` | `appUpdates.js` |
| GET | `/api/app-updates/check` | `appUpdates.js` |
| GET | `/api/app-updates/download/:releaseId` | `appUpdates.js` |
| GET | `/api/app-updates/filename-rule` | `appUpdates.js` |
| GET | `/api/app-updates/latest` | `appUpdates.js` |
| GET | `/api/app-updates/manifest` | `appUpdates.js` |
| GET | `/api/app-updates/ota-current` | `appUpdates.js` |
| DELETE | `/api/app-updates/releases/:id` | `appUpdates.js` |
| PUT | `/api/app-updates/releases/:id` | `appUpdates.js` |
| DELETE | `/api/app-updates/releases/:id/file` | `appUpdates.js` |
| POST | `/api/app-updates/releases/:id/run` | `appUpdates.js` |

### `/api/approvals` (10)

| Method | Path đầy đủ | File |
|---|---|---|
| POST | `/api/approvals/:approvalId/decide` | `approvals.js` |
| POST | `/api/approvals/:approvalId/re-request` | `approvals.js` |
| GET | `/api/approvals/check-auto/:projectId` | `approvals.js` |
| GET | `/api/approvals/io` | `approvals.js` |
| GET | `/api/approvals/pending` | `approvals.js` |
| GET | `/api/approvals/project/:projectId` | `approvals.js` |
| POST | `/api/approvals/project/:projectId/request` | `approvals.js` |
| GET | `/api/approvals/pushNotification` | `approvals.js` |
| GET | `/api/approvals/rules` | `approvals.js` |
| PUT | `/api/approvals/rules/:stageId` | `approvals.js` |

### `/api/assistant` (4)

| Method | Path đầy đủ | File |
|---|---|---|
| POST | `/api/assistant/chat` | `assistant.js` |
| POST | `/api/assistant/execute` | `assistant.js` |
| GET | `/api/assistant/me/briefing` | `assistant.js` |
| GET | `/api/assistant/suggestions` | `assistant.js` |

### `/api/auth` (17)

| Method | Path đầy đủ | File |
|---|---|---|
| POST | `/api/auth/change-password` | `auth.js` |
| POST | `/api/auth/check-permission` | `auth.js` |
| POST | `/api/auth/google` | `auth.js` |
| GET | `/api/auth/google-config` | `auth.js` |
| POST | `/api/auth/google-profile` | `auth.js` |
| GET | `/api/auth/io` | `auth.js` |
| POST | `/api/auth/login` | `auth.js` |
| POST | `/api/auth/logout` | `auth.js` |
| GET | `/api/auth/me` | `auth.js` |
| GET | `/api/auth/my-permissions` | `auth.js` |
| GET | `/api/auth/qr/:sessionId/info` | `auth.js` |
| GET | `/api/auth/qr/:sessionId/status` | `auth.js` |
| POST | `/api/auth/qr/confirm` | `auth.js` |
| POST | `/api/auth/qr/create` | `auth.js` |
| POST | `/api/auth/qr/create-invite` | `auth.js` |
| POST | `/api/auth/register` | `auth.js` |
| POST | `/api/auth/reset-seed-passwords` | `auth.js` |

### `/api/auth-events` (3)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/auth-events/` | `authEventLog.js` |
| GET | `/api/auth-events/:userId` | `authEventLog.js` |
| GET | `/api/auth-events/me` | `authEventLog.js` |

### `/api/batch-jobs` (8)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/batch-jobs/` | `batchJobs.js` |
| POST | `/api/batch-jobs/` | `batchJobs.js` |
| GET | `/api/batch-jobs/:id` | `batchJobs.js` |
| POST | `/api/batch-jobs/:id/cancel` | `batchJobs.js` |
| POST | `/api/batch-jobs/:id/pause` | `batchJobs.js` |
| POST | `/api/batch-jobs/:id/resume` | `batchJobs.js` |
| POST | `/api/batch-jobs/:id/retry` | `batchJobs.js` |
| GET | `/api/batch-jobs/types` | `batchJobs.js` |

### `/api/calc` (30)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/calc/categories` | `calc.js` |
| POST | `/api/calc/categories` | `calc.js` |
| DELETE | `/api/calc/categories/:id` | `calc.js` |
| PUT | `/api/calc/categories/:id` | `calc.js` |
| POST | `/api/calc/compute` | `calc.js` |
| GET | `/api/calc/formulas` | `calc.js` |
| POST | `/api/calc/formulas` | `calc.js` |
| DELETE | `/api/calc/formulas/:id` | `calc.js` |
| PUT | `/api/calc/formulas/:id` | `calc.js` |
| POST | `/api/calc/import-3d` | `calc.js` |
| POST | `/api/calc/import-items` | `calc.js` |
| GET | `/api/calc/imports` | `calc.js` |
| DELETE | `/api/calc/imports/:id` | `calc.js` |
| GET | `/api/calc/imports/:id` | `calc.js` |
| GET | `/api/calc/parsers` | `calc.js` |
| GET | `/api/calc/product-types` | `calc.js` |
| POST | `/api/calc/product-types` | `calc.js` |
| DELETE | `/api/calc/product-types/:id` | `calc.js` |
| GET | `/api/calc/product-types/:id` | `calc.js` |
| PUT | `/api/calc/product-types/:id` | `calc.js` |
| GET | `/api/calc/rules` | `calc.js` |
| POST | `/api/calc/rules` | `calc.js` |
| DELETE | `/api/calc/rules/:id` | `calc.js` |
| PUT | `/api/calc/rules/:id` | `calc.js` |
| GET | `/api/calc/runs` | `calc.js` |
| DELETE | `/api/calc/runs/:id` | `calc.js` |
| GET | `/api/calc/variables` | `calc.js` |
| POST | `/api/calc/variables` | `calc.js` |
| DELETE | `/api/calc/variables/:id` | `calc.js` |
| PUT | `/api/calc/variables/:id` | `calc.js` |

### `/api/companies` (9)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/companies/` | `companies.js` |
| POST | `/api/companies/` | `companies.js` |
| DELETE | `/api/companies/:companyId/employees/:userId` | `companies.js` |
| DELETE | `/api/companies/:id` | `companies.js` |
| GET | `/api/companies/:id` | `companies.js` |
| PUT | `/api/companies/:id` | `companies.js` |
| GET | `/api/companies/:id/employees` | `companies.js` |
| POST | `/api/companies/:id/employees` | `companies.js` |
| GET | `/api/companies/my/list` | `companies.js` |

### `/api/company-processes` (17)

| Method | Path đầy đủ | File |
|---|---|---|
| DELETE | `/api/company-processes/:id` | `companyProcesses.js` |
| GET | `/api/company-processes/:id` | `companyProcesses.js` |
| PUT | `/api/company-processes/:id` | `companyProcesses.js` |
| GET | `/api/company-processes/:processId/tasks` | `companyProcesses.js` |
| POST | `/api/company-processes/:processId/tasks` | `companyProcesses.js` |
| DELETE | `/api/company-processes/checklists/:id` | `companyProcesses.js` |
| PUT | `/api/company-processes/checklists/:id` | `companyProcesses.js` |
| POST | `/api/company-processes/clone/:fromUnitId/:toUnitId` | `companyProcesses.js` |
| GET | `/api/company-processes/flow-step/:stepId/processes` | `companyProcesses.js` |
| PUT | `/api/company-processes/flow-step/:stepId/processes` | `companyProcesses.js` |
| POST | `/api/company-processes/generate-suggestions/:unitId` | `companyProcesses.js` |
| DELETE | `/api/company-processes/tasks/:id` | `companyProcesses.js` |
| PUT | `/api/company-processes/tasks/:id` | `companyProcesses.js` |
| POST | `/api/company-processes/tasks/:taskId/checklists` | `companyProcesses.js` |
| GET | `/api/company-processes/unit/:unitId` | `companyProcesses.js` |
| POST | `/api/company-processes/unit/:unitId` | `companyProcesses.js` |
| PUT | `/api/company-processes/unit/:unitId/reorder` | `companyProcesses.js` |

### `/api/company-templates` (21)

| Method | Path đầy đủ | File |
|---|---|---|
| PUT | `/api/company-templates/project-assignments/:id` | `companyTemplates.js` |
| POST | `/api/company-templates/projects/:projectId/assign-company` | `companyTemplates.js` |
| GET | `/api/company-templates/projects/:projectId/flow` | `companyTemplates.js` |
| POST | `/api/company-templates/projects/:projectId/generate-from-template` | `companyTemplates.js` |
| POST | `/api/company-templates/projects/:projectId/handoff` | `companyTemplates.js` |
| GET | `/api/company-templates/projects/:projectId/handoffs` | `companyTemplates.js` |
| DELETE | `/api/company-templates/template-checklists/:id` | `companyTemplates.js` |
| PUT | `/api/company-templates/template-checklists/:id` | `companyTemplates.js` |
| DELETE | `/api/company-templates/template-sets/:id` | `companyTemplates.js` |
| GET | `/api/company-templates/template-sets/:id` | `companyTemplates.js` |
| PUT | `/api/company-templates/template-sets/:id` | `companyTemplates.js` |
| POST | `/api/company-templates/template-sets/:id/clone` | `companyTemplates.js` |
| POST | `/api/company-templates/template-sets/:id/copy-from-process` | `companyTemplates.js` |
| PUT | `/api/company-templates/template-sets/:setId/reorder-tasks` | `companyTemplates.js` |
| GET | `/api/company-templates/template-sets/:setId/tasks` | `companyTemplates.js` |
| POST | `/api/company-templates/template-sets/:setId/tasks` | `companyTemplates.js` |
| DELETE | `/api/company-templates/template-tasks/:id` | `companyTemplates.js` |
| PUT | `/api/company-templates/template-tasks/:id` | `companyTemplates.js` |
| POST | `/api/company-templates/template-tasks/:taskId/checklists` | `companyTemplates.js` |
| GET | `/api/company-templates/units/:unitId/template-sets` | `companyTemplates.js` |
| POST | `/api/company-templates/units/:unitId/template-sets` | `companyTemplates.js` |

### `/api/crm` (1)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/crm/io` | `crm/shared/helpersBundle.js` |

### `/api/crm/assignments` (29)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/crm/assignments/` | `crmAssignments.js` |
| POST | `/api/crm/assignments/` | `crmAssignments.js` |
| DELETE | `/api/crm/assignments/:id` | `crmAssignments.js` |
| GET | `/api/crm/assignments/:id` | `crmAssignments.js` |
| PUT | `/api/crm/assignments/:id` | `crmAssignments.js` |
| GET | `/api/crm/assignments/:id/comments` | `crmAssignments.js` |
| POST | `/api/crm/assignments/:id/comments` | `crmAssignments.js` |
| DELETE | `/api/crm/assignments/:id/comments/:cid` | `crmAssignments.js` |
| PUT | `/api/crm/assignments/:id/comments/:cid` | `crmAssignments.js` |
| GET | `/api/crm/assignments/:id/files` | `crmAssignments.js` |
| POST | `/api/crm/assignments/:id/files` | `crmAssignments.js` |
| DELETE | `/api/crm/assignments/:id/files/:fileId` | `crmAssignments.js` |
| POST | `/api/crm/assignments/:id/files/link` | `crmAssignments.js` |
| POST | `/api/crm/assignments/:id/move` | `crmAssignments.js` |
| GET | `/api/crm/assignments/columns` | `crmAssignments.js` |
| POST | `/api/crm/assignments/columns` | `crmAssignments.js` |
| DELETE | `/api/crm/assignments/columns/:id` | `crmAssignments.js` |
| PUT | `/api/crm/assignments/columns/:id` | `crmAssignments.js` |
| POST | `/api/crm/assignments/columns/reorder` | `crmAssignments.js` |
| GET | `/api/crm/assignments/io` | `crmAssignments.js` |
| GET | `/api/crm/assignments/lookups` | `crmAssignments.js` |
| GET | `/api/crm/assignments/private-deal-tasks` | `crmAssignments.js` |
| GET | `/api/crm/assignments/pushNotification` | `crmAssignments.js` |
| GET | `/api/crm/assignments/schedules` | `crmAssignments.js` |
| DELETE | `/api/crm/assignments/schedules/:sid` | `crmAssignments.js` |
| POST | `/api/crm/assignments/schedules/:sid/files` | `crmAssignments.js` |
| GET | `/api/crm/assignments/shared-workspace-tasks` | `crmAssignments.js` |
| GET | `/api/crm/assignments/stats` | `crmAssignments.js` |
| GET | `/api/crm/assignments/unread-count` | `crmAssignments.js` |

### `/api/crm/daily-reports` (15)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/crm/daily-reports/:id` | `crmDailyReports.js` |
| PATCH | `/api/crm/daily-reports/:id/manager-note` | `crmDailyReports.js` |
| GET | `/api/crm/daily-reports/history` | `crmDailyReports.js` |
| GET | `/api/crm/daily-reports/mine` | `crmDailyReports.js` |
| PUT | `/api/crm/daily-reports/mine` | `crmDailyReports.js` |
| POST | `/api/crm/daily-reports/mine/auto-close` | `crmDailyReports.js` |
| POST | `/api/crm/daily-reports/mine/extras` | `crmDailyReports.js` |
| DELETE | `/api/crm/daily-reports/mine/extras/:id` | `crmDailyReports.js` |
| PATCH | `/api/crm/daily-reports/mine/extras/:id` | `crmDailyReports.js` |
| GET | `/api/crm/daily-reports/mine/preview-auto` | `crmDailyReports.js` |
| GET | `/api/crm/daily-reports/team` | `crmDailyReports.js` |
| PUT | `/api/crm/daily-reports/team/assign-template` | `crmDailyReports.js` |
| GET | `/api/crm/daily-reports/team/matrix` | `crmDailyReports.js` |
| GET | `/api/crm/daily-reports/team/matrix-cell-links` | `crmDailyReports.js` |
| GET | `/api/crm/daily-reports/templates` | `crmDailyReports.js` |

### `/api/crm/deal-performance` (6)

| Method | Path đầy đủ | File |
|---|---|---|
| POST | `/api/crm/deal-performance/:leadId/cross-score` | `dealScores.js` |
| DELETE | `/api/crm/deal-performance/:leadId/cross-score/:rowId` | `dealScores.js` |
| POST | `/api/crm/deal-performance/:leadId/customer-rating` | `dealScores.js` |
| GET | `/api/crm/deal-performance/:leadId/summary` | `dealScores.js` |
| GET | `/api/crm/deal-performance/settings` | `dealScores.js` |
| PUT | `/api/crm/deal-performance/settings` | `dealScores.js` |

### `/api/crm/dept-plans` (9)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/crm/dept-plans/calendar` | `crmDeptPlans.js` |
| GET | `/api/crm/dept-plans/report` | `crmDeptPlans.js` |
| GET | `/api/crm/dept-plans/sheets` | `crmDeptPlans.js` |
| PATCH | `/api/crm/dept-plans/sheets/:id` | `crmDeptPlans.js` |
| GET | `/api/crm/dept-plans/sheets/list` | `crmDeptPlans.js` |
| POST | `/api/crm/dept-plans/tasks` | `crmDeptPlans.js` |
| DELETE | `/api/crm/dept-plans/tasks/:id` | `crmDeptPlans.js` |
| PATCH | `/api/crm/dept-plans/tasks/:id` | `crmDeptPlans.js` |
| POST | `/api/crm/dept-plans/tasks/import` | `crmDeptPlans.js` |

### `/api/crm/executive` (243)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/crm/executive/_version` | `crm` |
| POST | `/api/crm/executive/acceptance` | `executiveKpi.js` |
| GET | `/api/crm/executive/admin/sla-at-risk` | `crm` |
| POST | `/api/crm/executive/admin/sla-remind` | `crm` |
| GET | `/api/crm/executive/alerts/follow-ups` | `crm` |
| GET | `/api/crm/executive/auto-lead-blocked-phones` | `crm` |
| POST | `/api/crm/executive/auto-lead-blocked-phones` | `crm` |
| DELETE | `/api/crm/executive/auto-lead-blocked-phones/:id` | `crm` |
| GET | `/api/crm/executive/auto-project-config` | `crm` |
| PUT | `/api/crm/executive/auto-project-config` | `crm` |
| GET | `/api/crm/executive/companies/:companyId/visible-production-companies` | `crm` |
| PUT | `/api/crm/executive/companies/:companyId/visible-production-companies` | `crm` |
| GET | `/api/crm/executive/company-regions` | `crm` |
| POST | `/api/crm/executive/company-regions` | `crm` |
| PATCH | `/api/crm/executive/company-regions/:id` | `crm` |
| POST | `/api/crm/executive/company-regions/:id/regeocode` | `crm` |
| GET | `/api/crm/executive/contract-signed-revenue` | `crm` |
| GET | `/api/crm/executive/customers` | `crm` |
| POST | `/api/crm/executive/customers` | `crm` |
| GET | `/api/crm/executive/customers-overview` | `crm` |
| GET | `/api/crm/executive/customers-overview/:id` | `crm` |
| PUT | `/api/crm/executive/customers/:id` | `crm` |
| GET | `/api/crm/executive/dashboard` | `crm` |
| POST | `/api/crm/executive/deadline-bucket-counts` | `crm` |
| POST | `/api/crm/executive/deadline-bucket-pages` | `crm` |
| POST | `/api/crm/executive/deals` | `crm` |
| POST | `/api/crm/executive/deals/:id/auto-create-project` | `crm` |
| POST | `/api/crm/executive/deals/:id/reassign-sx` | `crm` |
| POST | `/api/crm/executive/deals/:id/spawn-additional` | `crm` |
| GET | `/api/crm/executive/deals/:id/spawned-additional` | `crm` |
| GET | `/api/crm/executive/deals/spawn-source-ids` | `crm` |
| PUT | `/api/crm/executive/documents/:docId/visibility` | `crm` |
| GET | `/api/crm/executive/employees-by-company` | `crm` |
| GET | `/api/crm/executive/filter-summary` | `crm` |
| DELETE | `/api/crm/executive/followup-care/dismiss` | `crm` |
| POST | `/api/crm/executive/followup-care/dismiss` | `crm` |
| POST | `/api/crm/executive/followup-care/dismiss-all` | `crm` |
| POST | `/api/crm/executive/followup-care/dismiss/undo` | `crm` |
| GET | `/api/crm/executive/followup-care/notifications` | `crm` |
| GET | `/api/crm/executive/invoices` | `crm` |
| POST | `/api/crm/executive/invoices` | `crm` |
| DELETE | `/api/crm/executive/invoices/:id` | `crm` |
| GET | `/api/crm/executive/invoices/:id` | `crm` |
| PUT | `/api/crm/executive/invoices/:id` | `crm` |
| POST | `/api/crm/executive/invoices/:id/items` | `crm` |
| POST | `/api/crm/executive/invoices/:id/misa-publish` | `crm` |
| POST | `/api/crm/executive/invoices/:id/misa-send-email` | `crm` |
| GET | `/api/crm/executive/invoices/:id/misa-status` | `crm` |
| POST | `/api/crm/executive/invoices/:id/payments` | `crm` |
| GET | `/api/crm/executive/invoices/:id/pdf` | `crm` |
| GET | `/api/crm/executive/io` | `crm` |
| GET | `/api/crm/executive/kanban-bootstrap` | `crm` |
| GET | `/api/crm/executive/kanban-rows` | `crm` |
| POST | `/api/crm/executive/kanban-stage-pages` | `crm` |
| GET | `/api/crm/executive/lead-care-marks` | `crm` |
| DELETE | `/api/crm/executive/lead-comments/:cid` | `crm` |
| PATCH | `/api/crm/executive/lead-comments/:cid` | `crm` |
| PUT | `/api/crm/executive/lead-comments/:cid/reaction` | `crm` |
| GET | `/api/crm/executive/lead-comments/index` | `crm` |
| GET | `/api/crm/executive/lead-types` | `crm` |
| POST | `/api/crm/executive/lead-types` | `crm` |
| DELETE | `/api/crm/executive/lead-types/:id` | `crm` |
| PUT | `/api/crm/executive/lead-types/:id` | `crm` |
| GET | `/api/crm/executive/leads` | `crm` |
| POST | `/api/crm/executive/leads` | `crm` |
| GET | `/api/crm/executive/leads-by-fb-page` | `crm` |
| GET | `/api/crm/executive/leads-deadlines` | `crm` |
| POST | `/api/crm/executive/leads-deadlines` | `crm` |
| DELETE | `/api/crm/executive/leads/:id` | `crm` |
| GET | `/api/crm/executive/leads/:id` | `crm` |
| PUT | `/api/crm/executive/leads/:id` | `crm` |
| GET | `/api/crm/executive/leads/:id/activities` | `crm` |
| POST | `/api/crm/executive/leads/:id/activities` | `crm` |
| PATCH | `/api/crm/executive/leads/:id/activities/:activityId` | `crm` |
| PUT | `/api/crm/executive/leads/:id/activities/:activityId/share` | `crm` |
| POST | `/api/crm/executive/leads/:id/activities/upload` | `crm` |
| GET | `/api/crm/executive/leads/:id/assignments` | `crm` |
| POST | `/api/crm/executive/leads/:id/assignments` | `crm` |
| GET | `/api/crm/executive/leads/:id/badge` | `crm` |
| DELETE | `/api/crm/executive/leads/:id/care-mark` | `crm` |
| POST | `/api/crm/executive/leads/:id/care-mark` | `crm` |
| GET | `/api/crm/executive/leads/:id/chat` | `crm` |
| POST | `/api/crm/executive/leads/:id/chat` | `crm` |
| PUT | `/api/crm/executive/leads/:id/chat/:msgId/pin` | `crm` |
| POST | `/api/crm/executive/leads/:id/chat/:msgId/react` | `crm` |
| POST | `/api/crm/executive/leads/:id/chat/drive` | `crm` |
| GET | `/api/crm/executive/leads/:id/chat/pinned` | `crm` |
| POST | `/api/crm/executive/leads/:id/chat/upload` | `crm` |
| GET | `/api/crm/executive/leads/:id/comments` | `crm` |
| POST | `/api/crm/executive/leads/:id/comments` | `crm` |
| PATCH | `/api/crm/executive/leads/:id/comments/read` | `crm` |
| GET | `/api/crm/executive/leads/:id/comments/read-receipts` | `crm` |
| POST | `/api/crm/executive/leads/:id/convert-to-deal` | `crm` |
| POST | `/api/crm/executive/leads/:id/convert-to-lead` | `crm` |
| POST | `/api/crm/executive/leads/:id/convert-to-project` | `crm` |
| POST | `/api/crm/executive/leads/:id/create-project` | `crm` |
| PATCH | `/api/crm/executive/leads/:id/deadline` | `crm` |
| GET | `/api/crm/executive/leads/:id/deadline-history` | `crm` |
| PATCH | `/api/crm/executive/leads/:id/deadline/disable-all` | `crm` |
| GET | `/api/crm/executive/leads/:id/detail` | `crm` |
| GET | `/api/crm/executive/leads/:id/documents` | `crm` |
| POST | `/api/crm/executive/leads/:id/documents` | `crm` |
| DELETE | `/api/crm/executive/leads/:id/documents/:docId` | `crm` |
| POST | `/api/crm/executive/leads/:id/documents/bulk` | `crm` |
| DELETE | `/api/crm/executive/leads/:id/interacted` | `crm` |
| POST | `/api/crm/executive/leads/:id/interacted` | `crm` |
| GET | `/api/crm/executive/leads/:id/members` | `crm` |
| POST | `/api/crm/executive/leads/:id/members` | `crm` |
| DELETE | `/api/crm/executive/leads/:id/members/:userId` | `crm` |
| DELETE | `/api/crm/executive/leads/:id/pin` | `crm` |
| POST | `/api/crm/executive/leads/:id/pin` | `crm` |
| GET | `/api/crm/executive/leads/:id/preview-project-tasks` | `crm` |
| GET | `/api/crm/executive/leads/:id/project-setup` | `crm` |
| GET | `/api/crm/executive/leads/:id/project-tasks` | `crm` |
| POST | `/api/crm/executive/leads/:id/reopen` | `crm` |
| POST | `/api/crm/executive/leads/:id/repair-pipeline-display` | `crm` |
| PATCH | `/api/crm/executive/leads/:id/stage` | `crm` |
| GET | `/api/crm/executive/leads/:id/stage-advance-check` | `crm` |
| POST | `/api/crm/executive/leads/:id/sx-handover` | `crm` |
| POST | `/api/crm/executive/leads/:id/sync-stage` | `crm` |
| GET | `/api/crm/executive/leads/:id/task-attachments` | `crm` |
| GET | `/api/crm/executive/leads/:id/task-documents` | `crm` |
| GET | `/api/crm/executive/leads/:id/tasks` | `crm` |
| POST | `/api/crm/executive/leads/:id/tasks` | `crm` |
| POST | `/api/crm/executive/leads/:id/tasks/:taskId/import-quotation-excel` | `crm` |
| POST | `/api/crm/executive/leads/:id/tasks/ensure-missing` | `crm` |
| POST | `/api/crm/executive/leads/:id/tasks/ensure-missing-sx` | `crm` |
| POST | `/api/crm/executive/leads/:id/tasks/from-template` | `crm` |
| POST | `/api/crm/executive/leads/:id/tasks/generate-production-template` | `crm` |
| POST | `/api/crm/executive/leads/:id/tasks/resync-pipeline` | `crm` |
| GET | `/api/crm/executive/leads/:id/transfer-options` | `crm` |
| POST | `/api/crm/executive/leads/:id/transfer-region` | `crm` |
| PATCH | `/api/crm/executive/leads/:id/vc-booking` | `crm` |
| GET | `/api/crm/executive/leads/:id/zalo-notify-preview` | `crm` |
| POST | `/api/crm/executive/leads/:id/zalo-notify-send` | `crm` |
| POST | `/api/crm/executive/leads/:id/zalo-template-fill` | `crm` |
| DELETE | `/api/crm/executive/leads/:leadId/tasks/:taskId` | `crm` |
| PUT | `/api/crm/executive/leads/:leadId/tasks/:taskId` | `crm` |
| GET | `/api/crm/executive/leads/:leadId/tasks/:taskId/attachments` | `crm` |
| POST | `/api/crm/executive/leads/:leadId/tasks/:taskId/attachments` | `crm` |
| DELETE | `/api/crm/executive/leads/:leadId/tasks/:taskId/attachments/:attId` | `crm` |
| PUT | `/api/crm/executive/leads/:leadId/tasks/:taskId/attachments/:attId/share-scope` | `crm` |
| PUT | `/api/crm/executive/leads/:leadId/tasks/:taskId/attachments/:attId/toggle-share` | `crm` |
| POST | `/api/crm/executive/leads/:leadId/tasks/:taskId/attachments/bulk` | `crm` |
| PUT | `/api/crm/executive/leads/:leadId/tasks/:taskId/checklist/:checklistId/notes` | `crm` |
| PUT | `/api/crm/executive/leads/:leadId/tasks/:taskId/notes` | `crm` |
| POST | `/api/crm/executive/leads/:leadId/tasks/:taskId/restore-checklist` | `crm` |
| PUT | `/api/crm/executive/leads/:leadId/tasks/:taskId/toggle-share` | `crm` |
| POST | `/api/crm/executive/leads/bulk-assign` | `crm` |
| POST | `/api/crm/executive/leads/cleanup-duplicates` | `crm` |
| POST | `/api/crm/executive/leads/merge-duplicates` | `crm` |
| POST | `/api/crm/executive/leads/merge-selected` | `crm` |
| GET | `/api/crm/executive/leads/picker` | `crm` |
| GET | `/api/crm/executive/leads/scan-duplicates` | `crm` |
| GET | `/api/crm/executive/leads/stage-counts` | `crm` |
| POST | `/api/crm/executive/leads/stage-history-summary` | `crm` |
| GET | `/api/crm/executive/ledger-net-by-leads` | `crm` |
| POST | `/api/crm/executive/ledger-net-by-leads` | `crm` |
| GET | `/api/crm/executive/live-version` | `crm` |
| GET | `/api/crm/executive/orders` | `crm` |
| POST | `/api/crm/executive/orders` | `crm` |
| DELETE | `/api/crm/executive/orders/:id` | `crm` |
| GET | `/api/crm/executive/orders/:id` | `crm` |
| PUT | `/api/crm/executive/orders/:id` | `crm` |
| POST | `/api/crm/executive/orders/:id/create-invoice` | `crm` |
| GET | `/api/crm/executive/orders/:id/pdf` | `crm` |
| GET | `/api/crm/executive/pipeline-stages` | `crm` |
| POST | `/api/crm/executive/pipeline-stages` | `crm` |
| PUT | `/api/crm/executive/pipeline-stages-reorder` | `crm` |
| DELETE | `/api/crm/executive/pipeline-stages/:id` | `crm` |
| PUT | `/api/crm/executive/pipeline-stages/:id` | `crm` |
| POST | `/api/crm/executive/pipeline-stages/:id/assign-production-columns` | `crm` |
| GET | `/api/crm/executive/pipeline-stages/:id/production-columns` | `crm` |
| GET | `/api/crm/executive/pipelines` | `crm` |
| POST | `/api/crm/executive/pipelines` | `crm` |
| DELETE | `/api/crm/executive/pipelines/:id` | `crm` |
| GET | `/api/crm/executive/pipelines/:id` | `crm` |
| PUT | `/api/crm/executive/pipelines/:id` | `crm` |
| POST | `/api/crm/executive/pipelines/:id/copy` | `crm` |
| POST | `/api/crm/executive/planner/columns` | `crm` |
| DELETE | `/api/crm/executive/planner/columns/:id` | `crm` |
| PATCH | `/api/crm/executive/planner/columns/:id` | `crm` |
| POST | `/api/crm/executive/planner/columns/:id/items` | `crm` |
| DELETE | `/api/crm/executive/planner/items/:id` | `crm` |
| GET | `/api/crm/executive/planner/me` | `crm` |
| POST | `/api/crm/executive/planner/reorder` | `crm` |
| GET | `/api/crm/executive/production-companies` | `crm` |
| POST | `/api/crm/executive/products` | `crm` |
| GET | `/api/crm/executive/products-list` | `crm` |
| PUT | `/api/crm/executive/products/:id` | `crm` |
| POST | `/api/crm/executive/project/:projectId/auto-invoice` | `crm` |
| GET | `/api/crm/executive/project/:projectId/lead-documents` | `crm` |
| GET | `/api/crm/executive/project/:projectId/shared-notes` | `crm` |
| GET | `/api/crm/executive/project/:projectId/summary` | `crm` |
| GET | `/api/crm/executive/projects/:projectId/documents` | `crm` |
| GET | `/api/crm/executive/quotations` | `crm` |
| POST | `/api/crm/executive/quotations` | `crm` |
| DELETE | `/api/crm/executive/quotations/:id` | `crm` |
| GET | `/api/crm/executive/quotations/:id` | `crm` |
| PUT | `/api/crm/executive/quotations/:id` | `crm` |
| POST | `/api/crm/executive/quotations/:id/convert-to-order` | `crm` |
| GET | `/api/crm/executive/quotations/:id/history` | `crm` |
| GET | `/api/crm/executive/quotations/:id/pdf` | `crm` |
| POST | `/api/crm/executive/quotations/excel-sheets` | `crm` |
| POST | `/api/crm/executive/quotations/parse-excel` | `crm` |
| GET | `/api/crm/executive/referrers` | `crm` |
| POST | `/api/crm/executive/referrers` | `crm` |
| GET | `/api/crm/executive/reports/org-activity-feed` | `crm` |
| GET | `/api/crm/executive/reports/org-overview` | `crm` |
| GET | `/api/crm/executive/reports/org-overview/export.pdf` | `crm` |
| GET | `/api/crm/executive/reports/org-overview/survey-visits` | `crm` |
| GET | `/api/crm/executive/reports/staff-lead-deal` | `crm` |
| GET | `/api/crm/executive/reports/staff-lead-deal/:userId/pipelines` | `crm` |
| GET | `/api/crm/executive/reports/staff-lead-deal/:userId/pipelines/export.pdf` | `crm` |
| GET | `/api/crm/executive/reports/staff-lead-deal/export.pdf` | `crm` |
| GET | `/api/crm/executive/settings/deadline-config` | `crm` |
| PUT | `/api/crm/executive/settings/deadline-config` | `crm` |
| GET | `/api/crm/executive/settings/deal-stage-report-buckets` | `crm` |
| PUT | `/api/crm/executive/settings/deal-stage-report-buckets` | `crm` |
| GET | `/api/crm/executive/source-categories` | `crm` |
| POST | `/api/crm/executive/source-categories` | `crm` |
| DELETE | `/api/crm/executive/source-categories/:id` | `crm` |
| PUT | `/api/crm/executive/source-categories/:id` | `crm` |
| GET | `/api/crm/executive/sources` | `crm` |
| POST | `/api/crm/executive/sources` | `crm` |
| PUT | `/api/crm/executive/sources/:id` | `crm` |
| GET | `/api/crm/executive/stage-counts` | `crm` |
| GET | `/api/crm/executive/summary` | `executiveKpi.js` |
| GET | `/api/crm/executive/task-templates` | `crm` |
| POST | `/api/crm/executive/task-templates` | `crm` |
| DELETE | `/api/crm/executive/task-templates/:id` | `crm` |
| PUT | `/api/crm/executive/task-templates/:id` | `crm` |
| POST | `/api/crm/executive/task-templates/:tplId/items` | `crm` |
| DELETE | `/api/crm/executive/task-templates/:tplId/items/:itemId` | `crm` |
| PUT | `/api/crm/executive/task-templates/:tplId/items/:itemId` | `crm` |
| POST | `/api/crm/executive/task-templates/apply-to-company-regions` | `crm` |
| PUT | `/api/crm/executive/task-templates/set-default-bundle` | `crm` |
| GET | `/api/crm/executive/tasks/overview` | `crm` |
| GET | `/api/crm/executive/tasks/planner` | `crm` |
| GET | `/api/crm/executive/web-dashboard-bootstrap` | `crm` |
| GET | `/api/crm/executive/zalo-notify-settings` | `crm` |
| PUT | `/api/crm/executive/zalo-notify-settings` | `crm` |
| POST | `/api/crm/executive/zalo-notify-test` | `crm` |

### `/api/customers` (8)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/customers/` | `customers.js` |
| POST | `/api/customers/` | `customers.js` |
| DELETE | `/api/customers/:custId/interactions/:intId` | `customers.js` |
| DELETE | `/api/customers/:id` | `customers.js` |
| GET | `/api/customers/:id` | `customers.js` |
| PUT | `/api/customers/:id` | `customers.js` |
| GET | `/api/customers/:id/interactions` | `customers.js` |
| POST | `/api/customers/:id/interactions` | `customers.js` |

### `/api/dashboard` (24)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/dashboard/` | `dashboard.js` |
| GET | `/api/dashboard/activity` | `dashboard.js` |
| GET | `/api/dashboard/alerts` | `dashboard.js` |
| GET | `/api/dashboard/by-division` | `dashboardDivisions.js` |
| GET | `/api/dashboard/customers` | `dashboard.js` |
| GET | `/api/dashboard/division/:divisionId` | `dashboard.js` |
| GET | `/api/dashboard/division/:divisionId/projects` | `dashboardDivisions.js` |
| GET | `/api/dashboard/divisions` | `dashboard.js` |
| GET | `/api/dashboard/notifications` | `dashboard.js` |
| PUT | `/api/dashboard/notifications/:id/dismiss` | `dashboard.js` |
| PUT | `/api/dashboard/notifications/:id/read` | `dashboard.js` |
| PUT | `/api/dashboard/notifications/bulk-dismiss` | `dashboard.js` |
| PUT | `/api/dashboard/notifications/bulk-read` | `dashboard.js` |
| PUT | `/api/dashboard/notifications/comment-mute` | `dashboard.js` |
| DELETE | `/api/dashboard/notifications/comment-mute/:leadId` | `dashboard.js` |
| GET | `/api/dashboard/notifications/comment-mute/:leadId` | `dashboard.js` |
| GET | `/api/dashboard/notifications/comment-mutes` | `dashboard.js` |
| GET | `/api/dashboard/notifications/deadlines` | `dashboard.js` |
| GET | `/api/dashboard/notifications/mutes` | `dashboard.js` |
| PUT | `/api/dashboard/notifications/read-all` | `dashboard.js` |
| GET | `/api/dashboard/overview` | `dashboard.js` |
| GET | `/api/dashboard/team` | `dashboard.js` |
| GET | `/api/dashboard/timeline` | `dashboard.js` |
| GET | `/api/dashboard/workload` | `dashboard.js` |

### `/api/dashboard-main` (2)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/dashboard-main/` | `dashboardMain.js` |
| GET | `/api/dashboard-main/stats` | `dashboardMain.js` |

### `/api/departments` (19)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/departments/` | `departments.js` |
| POST | `/api/departments/` | `departments.js` |
| DELETE | `/api/departments/:deptId/messages/:msgId` | `departments.js` |
| PUT | `/api/departments/:deptId/messages/:msgId` | `departments.js` |
| PUT | `/api/departments/:deptId/messages/:msgId/pin` | `departments.js` |
| POST | `/api/departments/:deptId/messages/:msgId/react` | `departments.js` |
| DELETE | `/api/departments/:id` | `departments.js` |
| GET | `/api/departments/:id` | `departments.js` |
| PUT | `/api/departments/:id` | `departments.js` |
| GET | `/api/departments/:id/chat/available-users` | `departments.js` |
| POST | `/api/departments/:id/chat/participants` | `departments.js` |
| DELETE | `/api/departments/:id/chat/participants/:userId` | `departments.js` |
| POST | `/api/departments/:id/chat/upload` | `departments.js` |
| POST | `/api/departments/:id/members` | `departments.js` |
| DELETE | `/api/departments/:id/members/:userId` | `departments.js` |
| GET | `/api/departments/:id/messages` | `departments.js` |
| POST | `/api/departments/:id/messages` | `departments.js` |
| GET | `/api/departments/io` | `departments.js` |
| GET | `/api/departments/my/list` | `departments.js` |

### `/api/devices` (5)

| Method | Path đầy đủ | File |
|---|---|---|
| DELETE | `/api/devices/:id` | `devices.js` |
| GET | `/api/devices/me` | `devices.js` |
| GET | `/api/devices/online` | `devices.js` |
| POST | `/api/devices/ping` | `devices.js` |
| POST | `/api/devices/test-push` | `devices.js` |

### `/api/divisions` (6)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/divisions/` | `divisions.js` |
| GET | `/api/divisions/:divisionId` | `divisions.js` |
| GET | `/api/divisions/:divisionId/active-projects` | `divisions.js` |
| GET | `/api/divisions/:divisionId/dashboard` | `divisions.js` |
| GET | `/api/divisions/:divisionId/projects-overview` | `divisions.js` |
| GET | `/api/divisions/:divisionId/task-summary` | `divisions.js` |

### `/api/drive` (59)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/drive/activity` | `drive.js` |
| GET | `/api/drive/activity/feed` | `drive.js` |
| PATCH | `/api/drive/admin/dept-category/:departmentId` | `drive.js` |
| PATCH | `/api/drive/admin/user-module/:userId` | `drive.js` |
| GET | `/api/drive/breadcrumb/entity/:entity_type/:entity_id` | `drive.js` |
| GET | `/api/drive/breadcrumb/file/:id` | `drive.js` |
| GET | `/api/drive/breadcrumb/folder/:id` | `drive.js` |
| GET | `/api/drive/company-images` | `drive.js` |
| GET | `/api/drive/entity/:entity_type/:entity_id/children` | `drive.js` |
| POST | `/api/drive/entity/:entity_type/:entity_id/folders` | `drive.js` |
| POST | `/api/drive/entity/create-google` | `drive.js` |
| POST | `/api/drive/entity/upload` | `drive.js` |
| DELETE | `/api/drive/files/:id` | `drive.js` |
| GET | `/api/drive/files/:id` | `drive.js` |
| PATCH | `/api/drive/files/:id` | `drive.js` |
| GET | `/api/drive/files/:id/download` | `drive.js` |
| DELETE | `/api/drive/files/:id/forever` | `drive.js` |
| GET | `/api/drive/files/:id/preview` | `drive.js` |
| GET | `/api/drive/files/:id/preview-content` | `drive.js` |
| POST | `/api/drive/files/:id/refresh-thumbnail` | `drive.js` |
| POST | `/api/drive/files/:id/restore` | `drive.js` |
| GET | `/api/drive/files/:id/stream` | `drive.js` |
| GET | `/api/drive/files/:id/thumbnail` | `drive.js` |
| POST | `/api/drive/files/create-google` | `drive.js` |
| POST | `/api/drive/files/upload` | `drive.js` |
| POST | `/api/drive/folders` | `drive.js` |
| DELETE | `/api/drive/folders/:id` | `drive.js` |
| PATCH | `/api/drive/folders/:id` | `drive.js` |
| GET | `/api/drive/folders/:id/children` | `drive.js` |
| DELETE | `/api/drive/folders/:id/forever` | `drive.js` |
| POST | `/api/drive/folders/:id/restore` | `drive.js` |
| GET | `/api/drive/folders/by-root/:rootId/children` | `drive.js` |
| GET | `/api/drive/health` | `drive.js` |
| POST | `/api/drive/links` | `drive.js` |
| DELETE | `/api/drive/links/:id` | `drive.js` |
| GET | `/api/drive/links/by-entity/:entity_type/:entity_id` | `drive.js` |
| GET | `/api/drive/links/by-file/:file_id` | `drive.js` |
| GET | `/api/drive/links/count-by-entity/:entity_type/:entity_id` | `drive.js` |
| GET | `/api/drive/modules` | `drive.js` |
| GET | `/api/drive/org-tree` | `drive.js` |
| POST | `/api/drive/org/ensure-user-drive` | `drive.js` |
| GET | `/api/drive/recent` | `drive.js` |
| GET | `/api/drive/roots` | `drive.js` |
| POST | `/api/drive/roots` | `drive.js` |
| POST | `/api/drive/roots/ensure-company` | `drive.js` |
| POST | `/api/drive/roots/ensure-company-images` | `drive.js` |
| POST | `/api/drive/roots/ensure-personal` | `drive.js` |
| POST | `/api/drive/roots/ensure-shared-company` | `drive.js` |
| POST | `/api/drive/roots/ensure-shared-region` | `drive.js` |
| POST | `/api/drive/roots/reset-personal` | `drive.js` |
| GET | `/api/drive/search` | `drive.js` |
| POST | `/api/drive/share` | `drive.js` |
| DELETE | `/api/drive/share/:id` | `drive.js` |
| GET | `/api/drive/share/:target_type/:target_id` | `drive.js` |
| GET | `/api/drive/shared-with-me` | `drive.js` |
| GET | `/api/drive/starred` | `drive.js` |
| POST | `/api/drive/stars` | `drive.js` |
| DELETE | `/api/drive/stars/:target_type/:target_id` | `drive.js` |
| GET | `/api/drive/trash` | `drive.js` |

### `/api/ecosystem` (32)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/ecosystem/available-companies` | `ecosystem.js` |
| GET | `/api/ecosystem/available-departments` | `ecosystem.js` |
| GET | `/api/ecosystem/can-manage/:unitId` | `ecosystem.js` |
| GET | `/api/ecosystem/company-modules` | `ecosystem.js` |
| GET | `/api/ecosystem/company-users/:companyId` | `ecosystem.js` |
| GET | `/api/ecosystem/levels` | `ecosystem.js` |
| POST | `/api/ecosystem/levels` | `ecosystem.js` |
| DELETE | `/api/ecosystem/levels/:id` | `ecosystem.js` |
| PUT | `/api/ecosystem/levels/:id` | `ecosystem.js` |
| GET | `/api/ecosystem/module-companies` | `ecosystem.js` |
| GET | `/api/ecosystem/module-scopes` | `ecosystem.js` |
| PUT | `/api/ecosystem/module-scopes/:moduleKey` | `ecosystem.js` |
| GET | `/api/ecosystem/my-module-access` | `ecosystem.js` |
| GET | `/api/ecosystem/my-units` | `ecosystem.js` |
| POST | `/api/ecosystem/projects/:projectId/units` | `ecosystem.js` |
| POST | `/api/ecosystem/setup-wizard` | `ecosystem.js` |
| GET | `/api/ecosystem/stage-groups` | `ecosystem.js` |
| POST | `/api/ecosystem/stage-groups` | `ecosystem.js` |
| PUT | `/api/ecosystem/stage-groups/:id` | `ecosystem.js` |
| POST | `/api/ecosystem/stage-groups/:id/generate-for-company` | `ecosystem.js` |
| POST | `/api/ecosystem/stage-groups/:id/stages` | `ecosystem.js` |
| GET | `/api/ecosystem/units` | `ecosystem.js` |
| POST | `/api/ecosystem/units` | `ecosystem.js` |
| DELETE | `/api/ecosystem/units/:id` | `ecosystem.js` |
| GET | `/api/ecosystem/units/:id` | `ecosystem.js` |
| PUT | `/api/ecosystem/units/:id` | `ecosystem.js` |
| POST | `/api/ecosystem/units/:id/members` | `ecosystem.js` |
| POST | `/api/ecosystem/units/:id/stage-groups` | `ecosystem.js` |
| DELETE | `/api/ecosystem/units/:unitId/members/:memberId` | `ecosystem.js` |
| PUT | `/api/ecosystem/units/:unitId/members/:memberId` | `ecosystem.js` |
| GET | `/api/ecosystem/units/:unitId/users` | `ecosystem.js` |
| POST | `/api/ecosystem/units/members` | `ecosystem.js` |

### `/api/events` (16)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/events/` | `events.js` |
| POST | `/api/events/` | `events.js` |
| DELETE | `/api/events/:eventId/comments/:commentId` | `events.js` |
| DELETE | `/api/events/:id` | `events.js` |
| GET | `/api/events/:id` | `events.js` |
| PUT | `/api/events/:id` | `events.js` |
| GET | `/api/events/:id/comments` | `events.js` |
| POST | `/api/events/:id/comments` | `events.js` |
| PUT | `/api/events/:id/respond` | `events.js` |
| GET | `/api/events/calendar` | `events.js` |
| GET | `/api/events/event-types` | `events.js` |
| POST | `/api/events/event-types` | `events.js` |
| DELETE | `/api/events/event-types/:id` | `events.js` |
| PUT | `/api/events/event-types/:id` | `events.js` |
| GET | `/api/events/map` | `events.js` |
| GET | `/api/events/overview` | `events.js` |

### `/api/external` (13)

| Method | Path đầy đủ | File |
|---|---|---|
| POST | `/api/external/deals` | `external.js` |
| GET | `/api/external/io` | `external.js` |
| GET | `/api/external/lead-types` | `external.js` |
| POST | `/api/external/leads` | `external.js` |
| GET | `/api/external/leads/stats` | `external.js` |
| POST | `/api/external/oauth/token` | `external.js` |
| GET | `/api/external/ping` | `external.js` |
| GET | `/api/external/pipelines` | `external.js` |
| GET | `/api/external/regions` | `external.js` |
| GET | `/api/external/source-categories` | `external.js` |
| GET | `/api/external/sources` | `external.js` |
| GET | `/api/external/stages` | `external.js` |
| GET | `/api/external/users` | `external.js` |

### `/api/facebook` (84)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/facebook/analytics` | `facebook.js` |
| GET | `/api/facebook/audit-phone-sync` | `facebook.js` |
| GET | `/api/facebook/auto-lead-config` | `facebook.js` |
| PUT | `/api/facebook/auto-lead-config` | `facebook.js` |
| GET | `/api/facebook/auto-lead-config/defaults` | `facebook.js` |
| GET | `/api/facebook/auto-pipeline/config` | `facebook.js` |
| PUT | `/api/facebook/auto-pipeline/config` | `facebook.js` |
| POST | `/api/facebook/auto-pipeline/master` | `facebook.js` |
| GET | `/api/facebook/auto-pipeline/master-schedule/config` | `facebook.js` |
| PUT | `/api/facebook/auto-pipeline/master-schedule/config` | `facebook.js` |
| GET | `/api/facebook/auto-pipeline/master-schedule/logs` | `facebook.js` |
| POST | `/api/facebook/auto-pipeline/start` | `facebook.js` |
| GET | `/api/facebook/auto-pipeline/status` | `facebook.js` |
| GET | `/api/facebook/auto-pipeline/status-all` | `facebook.js` |
| POST | `/api/facebook/auto-pipeline/stop` | `facebook.js` |
| GET | `/api/facebook/auto-tool/config` | `facebook.js` |
| PUT | `/api/facebook/auto-tool/config` | `facebook.js` |
| POST | `/api/facebook/auto-tool/start` | `facebook.js` |
| GET | `/api/facebook/auto-tool/status` | `facebook.js` |
| POST | `/api/facebook/auto-tool/stop` | `facebook.js` |
| POST | `/api/facebook/batch-create-leads` | `facebook.js` |
| POST | `/api/facebook/batch-extract-phones` | `facebook.js` |
| POST | `/api/facebook/batch-sync-messages` | `facebook.js` |
| POST | `/api/facebook/batch-sync-then-extract-phones` | `facebook.js` |
| GET | `/api/facebook/canned-replies` | `facebook.js` |
| POST | `/api/facebook/canned-replies` | `facebook.js` |
| DELETE | `/api/facebook/canned-replies/:id` | `facebook.js` |
| PUT | `/api/facebook/canned-replies/:id` | `facebook.js` |
| POST | `/api/facebook/canned-replies/import` | `facebook.js` |
| GET | `/api/facebook/comments` | `facebook.js` |
| POST | `/api/facebook/comments/:id/reply` | `facebook.js` |
| GET | `/api/facebook/contacts` | `facebook.js` |
| GET | `/api/facebook/contacts/:contactId/messages` | `facebook.js` |
| POST | `/api/facebook/contacts/:contactId/reply` | `facebook.js` |
| POST | `/api/facebook/contacts/:contactId/send-drive-folder` | `facebook.js` |
| POST | `/api/facebook/contacts/:contactId/send-image-set` | `facebook.js` |
| DELETE | `/api/facebook/contacts/:id` | `facebook.js` |
| GET | `/api/facebook/contacts/:id` | `facebook.js` |
| PUT | `/api/facebook/contacts/:id` | `facebook.js` |
| POST | `/api/facebook/contacts/:id/create-lead` | `facebook.js` |
| PUT | `/api/facebook/contacts/:id/link-lead` | `facebook.js` |
| POST | `/api/facebook/contacts/:id/reconcile-inbound-phone` | `facebook.js` |
| POST | `/api/facebook/contacts/:id/sync-history` | `facebook.js` |
| POST | `/api/facebook/contacts/backfill-last-message` | `facebook.js` |
| POST | `/api/facebook/dedup-leads` | `facebook.js` |
| GET | `/api/facebook/drive-folder-images` | `facebook.js` |
| GET | `/api/facebook/image-send-sources` | `facebook.js` |
| GET | `/api/facebook/image-sets` | `facebook.js` |
| POST | `/api/facebook/image-sets` | `facebook.js` |
| DELETE | `/api/facebook/image-sets/:id` | `facebook.js` |
| PUT | `/api/facebook/image-sets/:id` | `facebook.js` |
| GET | `/api/facebook/image-sets/:id/images` | `facebook.js` |
| GET | `/api/facebook/image-sets/admin` | `facebook.js` |
| GET | `/api/facebook/lead-ads` | `facebook.js` |
| GET | `/api/facebook/lead-scan/config` | `facebook.js` |
| PUT | `/api/facebook/lead-scan/config` | `facebook.js` |
| GET | `/api/facebook/lead-scan/preview` | `facebook.js` |
| POST | `/api/facebook/lead-scan/run` | `facebook.js` |
| GET | `/api/facebook/leads/:leadId/messages` | `facebook.js` |
| POST | `/api/facebook/migrate` | `facebook.js` |
| GET | `/api/facebook/page-sources` | `facebook.js` |
| GET | `/api/facebook/pages` | `facebook.js` |
| POST | `/api/facebook/pages` | `facebook.js` |
| DELETE | `/api/facebook/pages/:id` | `facebook.js` |
| PUT | `/api/facebook/pages/:id` | `facebook.js` |
| GET | `/api/facebook/pages/token-reminder-summary` | `facebook.js` |
| POST | `/api/facebook/phone-quality-apply` | `facebook.js` |
| POST | `/api/facebook/phone-quality-scan` | `facebook.js` |
| POST | `/api/facebook/pipeline-v2/run` | `facebook.js` |
| POST | `/api/facebook/refresh-names` | `facebook.js` |
| POST | `/api/facebook/rescan-phones` | `facebook.js` |
| GET | `/api/facebook/rescan-phones/schedule/config` | `facebook.js` |
| PUT | `/api/facebook/rescan-phones/schedule/config` | `facebook.js` |
| GET | `/api/facebook/scan-duplicates-debug` | `facebook.js` |
| POST | `/api/facebook/scan-leads-by-date` | `facebook.js` |
| GET | `/api/facebook/stats` | `facebook.js` |
| POST | `/api/facebook/sync-contact-phones` | `facebook.js` |
| POST | `/api/facebook/sync-source-ids` | `facebook.js` |
| POST | `/api/facebook/tools/link-only-phones/execute` | `facebook.js` |
| POST | `/api/facebook/tools/link-only-phones/preview` | `facebook.js` |
| GET | `/api/facebook/webhook` | `facebook.js` |
| POST | `/api/facebook/webhook` | `facebook.js` |
| DELETE | `/api/facebook/webhook-logs` | `facebook.js` |
| GET | `/api/facebook/webhook-logs` | `facebook.js` |

### `/api/flows` (20)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/flows/` | `flows.js` |
| POST | `/api/flows/` | `flows.js` |
| DELETE | `/api/flows/:id` | `flows.js` |
| GET | `/api/flows/:id` | `flows.js` |
| PUT | `/api/flows/:id` | `flows.js` |
| POST | `/api/flows/:id/clone` | `flows.js` |
| POST | `/api/flows/:id/run-actions` | `flows.js` |
| PUT | `/api/flows/:id/steps` | `flows.js` |
| GET | `/api/flows/io` | `flows.js` |
| GET | `/api/flows/meta/module-variables` | `flows.js` |
| GET | `/api/flows/meta/subjects` | `flows.js` |
| GET | `/api/flows/meta/wait-events` | `flows.js` |
| POST | `/api/flows/resolve-by-modules` | `flows.js` |
| GET | `/api/flows/steps/:stepId/tasks` | `flows.js` |
| POST | `/api/flows/steps/tasks` | `flows.js` |
| DELETE | `/api/flows/steps/tasks/:taskId` | `flows.js` |
| PUT | `/api/flows/steps/tasks/:taskId` | `flows.js` |
| POST | `/api/flows/steps/tasks/:taskId/checklists` | `flows.js` |
| DELETE | `/api/flows/steps/tasks/:taskId/checklists/:checklistId` | `flows.js` |
| PUT | `/api/flows/steps/tasks/:taskId/checklists/:checklistId` | `flows.js` |

### `/api/heartbeat` (1)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/heartbeat/` | `heartbeat.js` |

### `/api/integrations/stringee` (4)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/integrations/stringee/calls` | `stringee.js` |
| GET | `/api/integrations/stringee/debug` | `stringee.js` |
| GET | `/api/integrations/stringee/test` | `stringee.js` |
| POST | `/api/integrations/stringee/webhook` | `stringee.js` |

### `/api/internal-social` (23)

| Method | Path đầy đủ | File |
|---|---|---|
| POST | `/api/internal-social/mark-read` | `internalSocial.js` |
| GET | `/api/internal-social/online-members` | `internalSocial.js` |
| GET | `/api/internal-social/posts` | `internalSocial.js` |
| POST | `/api/internal-social/posts` | `internalSocial.js` |
| DELETE | `/api/internal-social/posts/:id` | `internalSocial.js` |
| GET | `/api/internal-social/posts/:id` | `internalSocial.js` |
| PUT | `/api/internal-social/posts/:id` | `internalSocial.js` |
| PUT | `/api/internal-social/posts/:id/blocked-companies` | `internalSocial.js` |
| GET | `/api/internal-social/posts/:id/comments` | `internalSocial.js` |
| POST | `/api/internal-social/posts/:id/comments` | `internalSocial.js` |
| DELETE | `/api/internal-social/posts/:id/hide-company` | `internalSocial.js` |
| POST | `/api/internal-social/posts/:id/hide-company` | `internalSocial.js` |
| DELETE | `/api/internal-social/posts/:id/hide-for-me` | `internalSocial.js` |
| POST | `/api/internal-social/posts/:id/hide-for-me` | `internalSocial.js` |
| POST | `/api/internal-social/posts/:id/like` | `internalSocial.js` |
| GET | `/api/internal-social/posts/:id/reactions` | `internalSocial.js` |
| POST | `/api/internal-social/posts/:postId/comments/:commentId/reaction` | `internalSocial.js` |
| GET | `/api/internal-social/profile/:userId` | `internalSocial.js` |
| GET | `/api/internal-social/profile/:userId/media` | `internalSocial.js` |
| GET | `/api/internal-social/profile/:userId/posts` | `internalSocial.js` |
| PATCH | `/api/internal-social/profile/me` | `internalSocial.js` |
| GET | `/api/internal-social/unread-count` | `internalSocial.js` |
| GET | `/api/internal-social/users/search` | `internalSocial.js` |

### `/api/knowledge` (38)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/knowledge/admin/certificates` | `knowledge.js` |
| POST | `/api/knowledge/admin/certificates/:id/revoke` | `knowledge.js` |
| GET | `/api/knowledge/admin/employee-progress` | `knowledge.js` |
| GET | `/api/knowledge/admin/exercises` | `knowledge.js` |
| POST | `/api/knowledge/admin/grant-certificate` | `knowledge.js` |
| GET | `/api/knowledge/admin/scoreboard` | `knowledge.js` |
| GET | `/api/knowledge/analytics` | `knowledge.js` |
| GET | `/api/knowledge/bookmarks` | `knowledge.js` |
| GET | `/api/knowledge/categories` | `knowledge.js` |
| POST | `/api/knowledge/categories` | `knowledge.js` |
| DELETE | `/api/knowledge/categories/:id` | `knowledge.js` |
| PATCH | `/api/knowledge/categories/:id` | `knowledge.js` |
| GET | `/api/knowledge/categories/:id/deadline-history` | `knowledge.js` |
| POST | `/api/knowledge/categories/:id/issue-certificate` | `knowledge.js` |
| GET | `/api/knowledge/categories/:id/learning-timeline` | `knowledge.js` |
| GET | `/api/knowledge/categories/:id/progress` | `knowledge.js` |
| GET | `/api/knowledge/certificates` | `knowledge.js` |
| GET | `/api/knowledge/certificates/:id` | `knowledge.js` |
| GET | `/api/knowledge/certificates/verify/:code` | `knowledge.js` |
| POST | `/api/knowledge/exercises` | `knowledge.js` |
| DELETE | `/api/knowledge/exercises/:id` | `knowledge.js` |
| GET | `/api/knowledge/exercises/:id` | `knowledge.js` |
| PATCH | `/api/knowledge/exercises/:id` | `knowledge.js` |
| POST | `/api/knowledge/exercises/:id/submit` | `knowledge.js` |
| GET | `/api/knowledge/lessons` | `knowledge.js` |
| POST | `/api/knowledge/lessons` | `knowledge.js` |
| DELETE | `/api/knowledge/lessons/:id` | `knowledge.js` |
| GET | `/api/knowledge/lessons/:id` | `knowledge.js` |
| PATCH | `/api/knowledge/lessons/:id` | `knowledge.js` |
| POST | `/api/knowledge/lessons/:id/bookmark` | `knowledge.js` |
| POST | `/api/knowledge/lessons/:id/complete` | `knowledge.js` |
| DELETE | `/api/knowledge/lessons/:id/rate` | `knowledge.js` |
| POST | `/api/knowledge/lessons/:id/rate` | `knowledge.js` |
| GET | `/api/knowledge/my-progress` | `knowledge.js` |
| GET | `/api/knowledge/my-submissions` | `knowledge.js` |
| GET | `/api/knowledge/submissions` | `knowledge.js` |
| PATCH | `/api/knowledge/submissions/:id/grade` | `knowledge.js` |
| GET | `/api/knowledge/users/:userId/certificates` | `knowledge.js` |

### `/api/kpi` (30)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/kpi/business-hours` | `kpi.js` |
| PUT | `/api/kpi/business-hours` | `kpi.js` |
| GET | `/api/kpi/company-overview` | `kpi.js` |
| GET | `/api/kpi/dashboard/deal` | `kpi.js` |
| GET | `/api/kpi/dashboard/sales-admin` | `kpi.js` |
| GET | `/api/kpi/deal-scores` | `kpi.js` |
| GET | `/api/kpi/definitions` | `kpi.js` |
| PATCH | `/api/kpi/definitions/:id` | `kpi.js` |
| GET | `/api/kpi/holidays` | `kpi.js` |
| POST | `/api/kpi/holidays` | `kpi.js` |
| DELETE | `/api/kpi/holidays/:id` | `kpi.js` |
| GET | `/api/kpi/lead-ledger/:leadId` | `kpi.js` |
| GET | `/api/kpi/lead-trace` | `kpi.js` |
| GET | `/api/kpi/leaderboard` | `kpi.js` |
| GET | `/api/kpi/leaves` | `kpi.js` |
| POST | `/api/kpi/leaves` | `kpi.js` |
| DELETE | `/api/kpi/leaves/:id` | `kpi.js` |
| PATCH | `/api/kpi/leaves/:id` | `kpi.js` |
| GET | `/api/kpi/periods` | `kpi.js` |
| PATCH | `/api/kpi/periods/:id` | `kpi.js` |
| GET | `/api/kpi/pipeline-mapping` | `kpi.js` |
| PATCH | `/api/kpi/pipeline-mapping/:stage_id` | `kpi.js` |
| POST | `/api/kpi/pipeline-mapping/auto` | `kpi.js` |
| POST | `/api/kpi/recompute` | `kpi.js` |
| GET | `/api/kpi/scorecard` | `kpi.js` |
| GET | `/api/kpi/scores` | `kpi.js` |
| GET | `/api/kpi/targets` | `kpi.js` |
| PUT | `/api/kpi/targets` | `kpi.js` |
| DELETE | `/api/kpi/targets/:id` | `kpi.js` |
| GET | `/api/kpi/users` | `kpi.js` |

### `/api/logistics` (23)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/logistics/dashboard` | `logistics.js` |
| GET | `/api/logistics/handover-settings/:companyId` | `logistics.js` |
| PUT | `/api/logistics/handover-settings/:companyId` | `logistics.js` |
| GET | `/api/logistics/io` | `logistics.js` |
| GET | `/api/logistics/notifications/comments` | `logistics.js` |
| PUT | `/api/logistics/notifications/comments/read-all` | `logistics.js` |
| GET | `/api/logistics/notifications/comments/unread-count` | `logistics.js` |
| GET | `/api/logistics/overview-kpis` | `logistics.js` |
| GET | `/api/logistics/pipeline-stages` | `logistics.js` |
| POST | `/api/logistics/pipeline-stages` | `logistics.js` |
| PUT | `/api/logistics/pipeline-stages-reorder` | `logistics.js` |
| DELETE | `/api/logistics/pipeline-stages/:id` | `logistics.js` |
| PUT | `/api/logistics/pipeline-stages/:id` | `logistics.js` |
| GET | `/api/logistics/projects` | `logistics.js` |
| DELETE | `/api/logistics/projects/:id` | `logistics.js` |
| GET | `/api/logistics/projects/:id` | `logistics.js` |
| GET | `/api/logistics/projects/:id/incidents` | `logistics.js` |
| POST | `/api/logistics/projects/:id/incidents` | `logistics.js` |
| PATCH | `/api/logistics/projects/:id/stage` | `logistics.js` |
| PATCH | `/api/logistics/projects/:projectId/incidents/:incidentId` | `logistics.js` |
| GET | `/api/logistics/trash` | `logistics.js` |
| DELETE | `/api/logistics/trash/:id` | `logistics.js` |
| POST | `/api/logistics/trash/:id/restore` | `logistics.js` |

### `/api/management` (4)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/management/by-project/:projectId` | `management.js` |
| GET | `/api/management/deals` | `management.js` |
| GET | `/api/management/deals/:leadId` | `management.js` |
| GET | `/api/management/overview` | `management.js` |

### `/api/mcp` (9)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/mcp/` | `mcp.js` |
| POST | `/api/mcp/` | `mcp.js` |
| GET | `/api/mcp/ping` | `mcp.js` |
| GET | `/api/mcp/reports/org-overview` | `mcp.js` |
| GET | `/api/mcp/reports/org-overview/summary` | `mcp.js` |
| GET | `/api/mcp/reports/org-overview/text` | `mcp.js` |
| POST | `/api/mcp/rpc` | `mcp.js` |
| GET | `/api/mcp/tools` | `mcp.js` |
| POST | `/api/mcp/tools/call` | `mcp.js` |

### `/api/messenger` (37)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/messenger/call-history` | `messengerGroups.js` |
| POST | `/api/messenger/direct` | `messengerGroups.js` |
| GET | `/api/messenger/files/download` | `messengerGroups.js` |
| GET | `/api/messenger/groups` | `messengerGroups.js` |
| POST | `/api/messenger/groups` | `messengerGroups.js` |
| POST | `/api/messenger/groups/:gid/chat/:mid/reaction` | `messengerGroups.js` |
| PUT | `/api/messenger/groups/:gid/chat/:mid/reaction` | `messengerGroups.js` |
| POST | `/api/messenger/groups/:gid/chat/:mid/recall` | `messengerGroups.js` |
| DELETE | `/api/messenger/groups/:groupId/nicknames/:targetUserId` | `messengerGroups.js` |
| PUT | `/api/messenger/groups/:groupId/nicknames/:targetUserId` | `messengerGroups.js` |
| GET | `/api/messenger/groups/:id` | `messengerGroups.js` |
| PATCH | `/api/messenger/groups/:id` | `messengerGroups.js` |
| DELETE | `/api/messenger/groups/:id/avatar` | `messengerGroups.js` |
| PATCH | `/api/messenger/groups/:id/avatar` | `messengerGroups.js` |
| GET | `/api/messenger/groups/:id/chat` | `messengerGroups.js` |
| POST | `/api/messenger/groups/:id/chat` | `messengerGroups.js` |
| POST | `/api/messenger/groups/:id/chat/drive` | `messengerGroups.js` |
| POST | `/api/messenger/groups/:id/chat/upload` | `messengerGroups.js` |
| POST | `/api/messenger/groups/:id/leave` | `messengerGroups.js` |
| GET | `/api/messenger/groups/:id/members` | `messengerGroups.js` |
| POST | `/api/messenger/groups/:id/members` | `messengerGroups.js` |
| DELETE | `/api/messenger/groups/:id/members/:userId` | `messengerGroups.js` |
| PATCH | `/api/messenger/groups/:id/members/:userId/role` | `messengerGroups.js` |
| PATCH | `/api/messenger/groups/:id/read` | `messengerGroups.js` |
| GET | `/api/messenger/groups/:id/read-receipts` | `messengerGroups.js` |
| DELETE | `/api/messenger/groups/:id/wallpaper` | `messengerGroups.js` |
| GET | `/api/messenger/groups/:id/wallpaper` | `messengerGroups.js` |
| PUT | `/api/messenger/groups/:id/wallpaper` | `messengerGroups.js` |
| GET | `/api/messenger/io` | `messengerGroups.js` |
| POST | `/api/messenger/leads/:leadId/ensure-internal-chat` | `messengerGroups.js` |
| GET | `/api/messenger/nicknames` | `messengerGroups.js` |
| DELETE | `/api/messenger/nicknames/:targetUserId` | `messengerGroups.js` |
| PUT | `/api/messenger/nicknames/:targetUserId` | `messengerGroups.js` |
| GET | `/api/messenger/pins` | `messengerGroups.js` |
| PUT | `/api/messenger/pins/:groupId` | `messengerGroups.js` |
| GET | `/api/messenger/upload-limits` | `messengerGroups.js` |
| GET | `/api/messenger/users/search` | `messengerGroups.js` |

### `/api/permissions` (20)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/permissions/catalog` | `permissions.js` |
| POST | `/api/permissions/check-permission` | `permissions.js` |
| GET | `/api/permissions/ecosystem-units/:unitId/permissions` | `permissions.js` |
| GET | `/api/permissions/permissions` | `permissions.js` |
| GET | `/api/permissions/roles` | `permissions.js` |
| POST | `/api/permissions/roles` | `permissions.js` |
| DELETE | `/api/permissions/roles/:id` | `permissions.js` |
| GET | `/api/permissions/roles/:id` | `permissions.js` |
| PUT | `/api/permissions/roles/:id` | `permissions.js` |
| GET | `/api/permissions/roles/:roleId/permissions` | `permissions.js` |
| PUT | `/api/permissions/roles/:roleId/permissions` | `permissions.js` |
| GET | `/api/permissions/roles/by-name/:name` | `permissions.js` |
| DELETE | `/api/permissions/user-roles/:id` | `permissions.js` |
| GET | `/api/permissions/users/:userId/effective` | `permissions.js` |
| PUT | `/api/permissions/users/:userId/overrides` | `permissions.js` |
| GET | `/api/permissions/users/:userId/roles` | `permissions.js` |
| POST | `/api/permissions/users/:userId/roles` | `permissions.js` |
| PUT | `/api/permissions/users/bulk-overrides` | `permissions.js` |
| POST | `/api/permissions/users/custom-permission` | `permissions.js` |
| POST | `/api/permissions/users/effective/bulk` | `permissions.js` |

### `/api/platform` (16)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/platform/stats/overview` | `platform.js` |
| GET | `/api/platform/tenants` | `platform.js` |
| POST | `/api/platform/tenants` | `platform.js` |
| DELETE | `/api/platform/tenants/:id` | `platform.js` |
| GET | `/api/platform/tenants/:id` | `platform.js` |
| PATCH | `/api/platform/tenants/:id` | `platform.js` |
| GET | `/api/platform/tenants/:id/companies` | `platform.js` |
| GET | `/api/platform/tenants/:id/ecosystem` | `platform.js` |
| GET | `/api/platform/tenants/:id/features` | `platform.js` |
| POST | `/api/platform/tenants/:id/features` | `platform.js` |
| GET | `/api/platform/tenants/:id/stats` | `platform.js` |
| GET | `/api/platform/tenants/:id/users` | `platform.js` |
| POST | `/api/platform/tenants/onboard` | `platform.js` |
| GET | `/api/platform/tier-features` | `platform.js` |
| PATCH | `/api/platform/tier-features` | `platform.js` |
| GET | `/api/platform/users` | `platform.js` |

### `/api/procurement` (10)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/procurement/projects/:projectId/summary` | `procurement.js` |
| GET | `/api/procurement/requests` | `procurement.js` |
| POST | `/api/procurement/requests` | `procurement.js` |
| DELETE | `/api/procurement/requests/:id` | `procurement.js` |
| GET | `/api/procurement/requests/:id` | `procurement.js` |
| PUT | `/api/procurement/requests/:id` | `procurement.js` |
| GET | `/api/procurement/suppliers` | `procurement.js` |
| POST | `/api/procurement/suppliers` | `procurement.js` |
| DELETE | `/api/procurement/suppliers/:id` | `procurement.js` |
| PUT | `/api/procurement/suppliers/:id` | `procurement.js` |

### `/api/production` (55)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/production/client-companies` | `production.js` |
| GET | `/api/production/dashboard` | `production.js` |
| GET | `/api/production/deadline-bucket-page` | `production.js` |
| GET | `/api/production/external-companies` | `production.js` |
| POST | `/api/production/external-companies` | `production.js` |
| GET | `/api/production/handover-settings/:companyId` | `production.js` |
| PUT | `/api/production/handover-settings/:companyId` | `production.js` |
| GET | `/api/production/io` | `production.js` |
| GET | `/api/production/notifications/comments` | `production.js` |
| PUT | `/api/production/notifications/comments/read-all` | `production.js` |
| GET | `/api/production/notifications/comments/unread-count` | `production.js` |
| GET | `/api/production/pipeline-stages` | `production.js` |
| POST | `/api/production/pipeline-stages` | `production.js` |
| PUT | `/api/production/pipeline-stages-reorder` | `production.js` |
| DELETE | `/api/production/pipeline-stages/:id` | `production.js` |
| PUT | `/api/production/pipeline-stages/:id` | `production.js` |
| POST | `/api/production/pipeline-stages/seed-default-kitchen-glass` | `production.js` |
| POST | `/api/production/pipeline-stages/seed-samples` | `production.js` |
| POST | `/api/production/planner/columns` | `production.js` |
| DELETE | `/api/production/planner/columns/:id` | `production.js` |
| PATCH | `/api/production/planner/columns/:id` | `production.js` |
| POST | `/api/production/planner/columns/:id/items` | `production.js` |
| DELETE | `/api/production/planner/items/:id` | `production.js` |
| GET | `/api/production/planner/me` | `production.js` |
| POST | `/api/production/planner/reorder` | `production.js` |
| GET | `/api/production/projects` | `production.js` |
| GET | `/api/production/projects/:id` | `production.js` |
| PATCH | `/api/production/projects/:id/handover-vc` | `production.js` |
| GET | `/api/production/projects/:id/incidents` | `production.js` |
| POST | `/api/production/projects/:id/incidents` | `production.js` |
| PATCH | `/api/production/projects/:id/kanban-deadline` | `production.js` |
| GET | `/api/production/projects/:id/participant-companies` | `production.js` |
| POST | `/api/production/projects/:id/place-at-workshops` | `production.js` |
| PATCH | `/api/production/projects/:id/stage` | `production.js` |
| PATCH | `/api/production/projects/:id/switch-workshop-type` | `production.js` |
| POST | `/api/production/projects/:id/tasks/ensure-missing-sx` | `production.js` |
| POST | `/api/production/projects/:id/tasks/from-template` | `production.js` |
| POST | `/api/production/projects/:id/tasks/generate-from-templates` | `production.js` |
| GET | `/api/production/projects/:id/workshop-placements` | `production.js` |
| PATCH | `/api/production/projects/:projectId/incidents/:incidentId` | `production.js` |
| GET | `/api/production/schedule-config` | `production.js` |
| PUT | `/api/production/schedule-config` | `production.js` |
| GET | `/api/production/task-templates` | `production.js` |
| POST | `/api/production/task-templates` | `production.js` |
| DELETE | `/api/production/task-templates/:id` | `production.js` |
| PUT | `/api/production/task-templates/:id` | `production.js` |
| POST | `/api/production/task-templates/:tplId/items` | `production.js` |
| DELETE | `/api/production/task-templates/:tplId/items/:itemId` | `production.js` |
| PUT | `/api/production/task-templates/:tplId/items/:itemId` | `production.js` |
| PUT | `/api/production/task-templates/set-default-bundle` | `production.js` |
| POST | `/api/production/workshop-intake` | `production.js` |
| GET | `/api/production/workshop-options` | `production.js` |
| GET | `/api/production/workshop-type-staff-defaults/:companyId` | `production.js` |
| PUT | `/api/production/workshop-type-staff-defaults/:companyId` | `production.js` |
| POST | `/api/production/workshop-type-staff-defaults/:companyId/apply-to-projects` | `production.js` |

### `/api/production/backup-sync` (20)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/production/backup-sync/activity-log` | `productionBackupSync.js` |
| GET | `/api/production/backup-sync/history` | `productionBackupSync.js` |
| GET | `/api/production/backup-sync/monitor` | `productionBackupSync.js` |
| POST | `/api/production/backup-sync/run` | `productionBackupSync.js` |
| GET | `/api/production/backup-sync/session` | `productionBackupSync.js` |
| GET | `/api/production/backup-sync/settings` | `productionBackupSync.js` |
| PUT | `/api/production/backup-sync/settings` | `productionBackupSync.js` |
| GET | `/api/production/backup-sync/status` | `productionBackupSync.js` |
| POST | `/api/production/backup-sync/switch/cancel` | `productionBackupSync.js` |
| POST | `/api/production/backup-sync/switch/confirm` | `productionBackupSync.js` |
| GET | `/api/production/backup-sync/switch/pending` | `productionBackupSync.js` |
| POST | `/api/production/backup-sync/switch/prepare` | `productionBackupSync.js` |
| GET | `/api/production/backup-sync/switch/public-pending` | `productionBackupSync.js` |
| POST | `/api/production/backup-sync/switch/quick` | `productionBackupSync.js` |
| POST | `/api/production/backup-sync/switch/start-countdown` | `productionBackupSync.js` |
| GET | `/api/production/backup-sync/sync/public-status` | `productionBackupSync.js` |
| POST | `/api/production/backup-sync/unlock` | `productionBackupSync.js` |
| GET | `/api/production/backup-sync/update-logs` | `productionBackupSync.js` |
| GET | `/api/production/backup-sync/usage-analytics` | `productionBackupSync.js` |
| POST | `/api/production/backup-sync/verify` | `productionBackupSync.js` |

### `/api/products` (23)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/products/` | `products.js` |
| POST | `/api/products/` | `products.js` |
| DELETE | `/api/products/:id` | `products.js` |
| GET | `/api/products/:id` | `products.js` |
| PUT | `/api/products/:id` | `products.js` |
| POST | `/api/products/:id/structures` | `products.js` |
| DELETE | `/api/products/:productId/structures/:structId` | `products.js` |
| PUT | `/api/products/:productId/structures/:structId` | `products.js` |
| GET | `/api/products/categories` | `products.js` |
| POST | `/api/products/categories` | `products.js` |
| DELETE | `/api/products/categories/:id` | `products.js` |
| PUT | `/api/products/categories/:id` | `products.js` |
| GET | `/api/products/code-parts` | `products.js` |
| POST | `/api/products/code-parts` | `products.js` |
| DELETE | `/api/products/code-parts/:id` | `products.js` |
| PUT | `/api/products/code-parts/:id` | `products.js` |
| POST | `/api/products/code-parts/auto-extract` | `products.js` |
| POST | `/api/products/components` | `products.js` |
| DELETE | `/api/products/components/:id` | `products.js` |
| PUT | `/api/products/components/:id` | `products.js` |
| GET | `/api/products/components/list` | `products.js` |
| GET | `/api/products/export` | `products.js` |
| POST | `/api/products/import` | `products.js` |

### `/api/projects` (49)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/projects/` | `projects.js` |
| POST | `/api/projects/` | `projects.js` |
| DELETE | `/api/projects/:id` | `projects.js` |
| GET | `/api/projects/:id` | `projects.js` |
| PUT | `/api/projects/:id` | `projects.js` |
| GET | `/api/projects/:id/activities` | `projects.js` |
| POST | `/api/projects/:id/activities` | `projects.js` |
| POST | `/api/projects/:id/approve-advance` | `projects.js` |
| GET | `/api/projects/:id/cashflow` | `projects.js` |
| POST | `/api/projects/:id/check-advance` | `projects.js` |
| GET | `/api/projects/:id/comments` | `projects.js` |
| POST | `/api/projects/:id/comments` | `projects.js` |
| DELETE | `/api/projects/:id/comments/:commentId` | `projects.js` |
| PATCH | `/api/projects/:id/comments/:commentId` | `projects.js` |
| PUT | `/api/projects/:id/comments/:commentId/reaction` | `projects.js` |
| PATCH | `/api/projects/:id/comments/read` | `projects.js` |
| GET | `/api/projects/:id/comments/read-receipts` | `projects.js` |
| GET | `/api/projects/:id/documents` | `projects.js` |
| DELETE | `/api/projects/:id/documents/:docId` | `projects.js` |
| PUT | `/api/projects/:id/documents/:docId/share-crm` | `projects.js` |
| POST | `/api/projects/:id/documents/bulk` | `projects.js` |
| POST | `/api/projects/:id/expenses` | `projects.js` |
| POST | `/api/projects/:id/generate-tasks` | `projects.js` |
| DELETE | `/api/projects/:id/lead-documents/:docId` | `projects.js` |
| GET | `/api/projects/:id/orders` | `projects.js` |
| POST | `/api/projects/:id/orders` | `projects.js` |
| DELETE | `/api/projects/:id/orders/:orderId` | `projects.js` |
| PUT | `/api/projects/:id/orders/:orderId` | `projects.js` |
| POST | `/api/projects/:id/orders/:orderId/push-to-logistics` | `projects.js` |
| POST | `/api/projects/:id/orders/:orderId/push-to-production` | `projects.js` |
| POST | `/api/projects/:id/orders/push-to-logistics-bulk` | `projects.js` |
| POST | `/api/projects/:id/orders/push-to-production-bulk` | `projects.js` |
| GET | `/api/projects/:id/products` | `projects.js` |
| POST | `/api/projects/:id/products` | `projects.js` |
| DELETE | `/api/projects/:id/products/:ppId` | `projects.js` |
| POST | `/api/projects/:id/request-approval` | `projects.js` |
| PUT | `/api/projects/:id/stage` | `projects.js` |
| GET | `/api/projects/:id/task-files` | `projects.js` |
| GET | `/api/projects/:id/workflow-lines` | `projects.js` |
| POST | `/api/projects/:id/workflow-lines` | `projects.js` |
| PUT | `/api/projects/:id/workflow-lines-order` | `projects.js` |
| DELETE | `/api/projects/:id/workflow-lines/:lineId` | `projects.js` |
| PUT | `/api/projects/:id/workflow-lines/:lineId` | `projects.js` |
| GET | `/api/projects/comments/index` | `projects.js` |
| POST | `/api/projects/create-with-flow` | `projects.js` |
| GET | `/api/projects/io` | `projects.js` |
| GET | `/api/projects/latest-comments` | `projects.js` |
| GET | `/api/projects/pending-approvals` | `projects.js` |
| GET | `/api/projects/pushNotification` | `projects.js` |

### `/api/purchasing` (18)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/purchasing/brands` | `purchasing.js` |
| POST | `/api/purchasing/brands` | `purchasing.js` |
| DELETE | `/api/purchasing/brands/:id` | `purchasing.js` |
| PUT | `/api/purchasing/brands/:id` | `purchasing.js` |
| GET | `/api/purchasing/categories` | `purchasing.js` |
| POST | `/api/purchasing/categories` | `purchasing.js` |
| PUT | `/api/purchasing/categories/:id` | `purchasing.js` |
| GET | `/api/purchasing/orders` | `purchasing.js` |
| POST | `/api/purchasing/orders` | `purchasing.js` |
| DELETE | `/api/purchasing/orders/:id` | `purchasing.js` |
| GET | `/api/purchasing/orders/:id` | `purchasing.js` |
| PUT | `/api/purchasing/orders/:id` | `purchasing.js` |
| POST | `/api/purchasing/orders/:id/status` | `purchasing.js` |
| POST | `/api/purchasing/orders/:id/submit` | `purchasing.js` |
| GET | `/api/purchasing/products` | `purchasing.js` |
| POST | `/api/purchasing/products` | `purchasing.js` |
| PUT | `/api/purchasing/products/:id` | `purchasing.js` |
| GET | `/api/purchasing/suppliers` | `purchasing.js` |

### `/api/push` (14)

| Method | Path đầy đủ | File |
|---|---|---|
| POST | `/api/push/call-accept` | `push.js` |
| POST | `/api/push/call-reject` | `push.js` |
| GET | `/api/push/comment-display-users` | `push.js` |
| PUT | `/api/push/comment-display-users` | `push.js` |
| DELETE | `/api/push/device-token` | `push.js` |
| POST | `/api/push/device-token` | `push.js` |
| GET | `/api/push/finalizeDirectCallLog` | `push.js` |
| GET | `/api/push/io` | `push.js` |
| GET | `/api/push/preferences` | `push.js` |
| PUT | `/api/push/preferences` | `push.js` |
| GET | `/api/push/status` | `push.js` |
| POST | `/api/push/subscribe` | `push.js` |
| POST | `/api/push/unsubscribe` | `push.js` |
| GET | `/api/push/vapid-key` | `push.js` |

### `/api/release-notes` (9)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/release-notes/` | `releaseNotes.js` |
| POST | `/api/release-notes/` | `releaseNotes.js` |
| DELETE | `/api/release-notes/:id` | `releaseNotes.js` |
| GET | `/api/release-notes/:id` | `releaseNotes.js` |
| PUT | `/api/release-notes/:id` | `releaseNotes.js` |
| PUT | `/api/release-notes/:id/mark-read` | `releaseNotes.js` |
| GET | `/api/release-notes/login-banner` | `releaseNotes.js` |
| GET | `/api/release-notes/login-queue` | `releaseNotes.js` |
| GET | `/api/release-notes/unread-count` | `releaseNotes.js` |

### `/api/saas/payment` (6)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/saas/payment/checkout/:purchaseId` | `saasPayment.js` |
| GET | `/api/saas/payment/sandbox/:purchaseId` | `saasPayment.js` |
| POST | `/api/saas/payment/sandbox/:purchaseId/complete` | `saasPayment.js` |
| GET | `/api/saas/payment/status/:purchaseId` | `saasPayment.js` |
| GET | `/api/saas/payment/vnpay/ipn` | `saasPayment.js` |
| GET | `/api/saas/payment/vnpay/return` | `saasPayment.js` |

### `/api/settings` (15)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/settings/api-keys` | `settings.js` |
| POST | `/api/settings/api-keys` | `settings.js` |
| DELETE | `/api/settings/api-keys/:id` | `settings.js` |
| PATCH | `/api/settings/api-keys/:id` | `settings.js` |
| POST | `/api/settings/api-keys/:id/rotate` | `settings.js` |
| DELETE | `/api/settings/call-ringtone` | `settings.js` |
| GET | `/api/settings/call-ringtone` | `settings.js` |
| POST | `/api/settings/call-ringtone` | `settings.js` |
| GET | `/api/settings/company` | `settings.js` |
| PUT | `/api/settings/company` | `settings.js` |
| GET | `/api/settings/misa` | `settings.js` |
| PUT | `/api/settings/misa` | `settings.js` |
| POST | `/api/settings/misa/test` | `settings.js` |
| GET | `/api/settings/theme` | `settings.js` |
| PUT | `/api/settings/theme` | `settings.js` |

### `/api/stages` (11)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/stages/` | `stages.js` |
| POST | `/api/stages/` | `stages.js` |
| DELETE | `/api/stages/:id` | `stages.js` |
| PUT | `/api/stages/:id` | `stages.js` |
| GET | `/api/stages/customer-statuses` | `stages.js` |
| POST | `/api/stages/customer-statuses` | `stages.js` |
| DELETE | `/api/stages/customer-statuses/:csId` | `stages.js` |
| PUT | `/api/stages/customer-statuses/:csId` | `stages.js` |
| PUT | `/api/stages/reorder` | `stages.js` |
| GET | `/api/stages/status-mapping` | `stages.js` |
| PUT | `/api/stages/status-mapping` | `stages.js` |

### `/api/tasks` (28)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/tasks/` | `tasks.js` |
| POST | `/api/tasks/` | `tasks.js` |
| DELETE | `/api/tasks/:id` | `tasks.js` |
| GET | `/api/tasks/:id` | `tasks.js` |
| PUT | `/api/tasks/:id` | `tasks.js` |
| GET | `/api/tasks/:id/attachments` | `tasks.js` |
| POST | `/api/tasks/:id/attachments/bulk` | `tasks.js` |
| GET | `/api/tasks/:id/checklists` | `tasks.js` |
| POST | `/api/tasks/:id/checklists` | `tasks.js` |
| GET | `/api/tasks/:id/comments` | `tasks.js` |
| POST | `/api/tasks/:id/comments` | `tasks.js` |
| GET | `/api/tasks/:id/participants` | `tasks.js` |
| POST | `/api/tasks/:id/participants` | `tasks.js` |
| PATCH | `/api/tasks/:id/status` | `tasks.js` |
| GET | `/api/tasks/:id/time-logs` | `tasks.js` |
| POST | `/api/tasks/:id/time-logs` | `tasks.js` |
| DELETE | `/api/tasks/:taskId/attachments/:attId` | `tasks.js` |
| DELETE | `/api/tasks/:taskId/checklists/:clId` | `tasks.js` |
| PATCH | `/api/tasks/:taskId/checklists/:clId` | `tasks.js` |
| DELETE | `/api/tasks/:taskId/comments/:commentId` | `tasks.js` |
| DELETE | `/api/tasks/:taskId/participants/:userId` | `tasks.js` |
| DELETE | `/api/tasks/:taskId/time-logs/:logId` | `tasks.js` |
| PUT | `/api/tasks/checklists/:clId` | `tasks.js` |
| GET | `/api/tasks/io` | `tasks.js` |
| GET | `/api/tasks/my` | `tasks.js` |
| GET | `/api/tasks/overdue` | `tasks.js` |
| GET | `/api/tasks/planner/board` | `tasks.js` |
| PUT | `/api/tasks/planner/reorder` | `tasks.js` |

### `/api/teams` (8)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/teams/` | `teams.js` |
| POST | `/api/teams/` | `teams.js` |
| DELETE | `/api/teams/:id` | `teams.js` |
| GET | `/api/teams/:id` | `teams.js` |
| PUT | `/api/teams/:id` | `teams.js` |
| GET | `/api/teams/:id/available-members` | `teams.js` |
| POST | `/api/teams/:id/members` | `teams.js` |
| DELETE | `/api/teams/:id/members/:userId` | `teams.js` |

### `/api/templates` (7)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/templates/` | `templates.js` |
| POST | `/api/templates/` | `templates.js` |
| DELETE | `/api/templates/:id` | `templates.js` |
| PUT | `/api/templates/:id` | `templates.js` |
| PATCH | `/api/templates/:id/toggle` | `templates.js` |
| POST | `/api/templates/activate-all` | `templates.js` |
| GET | `/api/templates/by-stage` | `templates.js` |

### `/api/tenant` (8)

| Method | Path đầy đủ | File |
|---|---|---|
| POST | `/api/tenant/finish-setup` | `tenantUsage.js` |
| POST | `/api/tenant/first-setup` | `tenantUsage.js` |
| POST | `/api/tenant/setup-departments` | `tenantUsage.js` |
| POST | `/api/tenant/setup-ecosystem` | `tenantUsage.js` |
| GET | `/api/tenant/setup-progress` | `tenantUsage.js` |
| POST | `/api/tenant/setup-staff` | `tenantUsage.js` |
| GET | `/api/tenant/setup-status` | `tenantUsage.js` |
| GET | `/api/tenant/usage` | `tenantUsage.js` |

### `/api/trash` (5)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/trash/` | `trash.js` |
| DELETE | `/api/trash/:id` | `trash.js` |
| GET | `/api/trash/:id` | `trash.js` |
| POST | `/api/trash/:id/restore` | `trash.js` |
| POST | `/api/trash/empty` | `trash.js` |

### `/api/turn` (1)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/turn/credentials` | `turn.js` |

### `/api/upload` (8)

| Method | Path đầy đủ | File |
|---|---|---|
| POST | `/api/upload/` | `upload.js` |
| GET | `/api/upload/:entity_type/:entity_id` | `upload.js` |
| DELETE | `/api/upload/:id` | `upload.js` |
| POST | `/api/upload/internal-social` | `upload.js` |
| POST | `/api/upload/internal-social-stream` | `upload.js` |
| GET | `/api/upload/serve-local` | `upload.js` |
| POST | `/api/upload/single` | `upload.js` |
| POST | `/api/upload/stream` | `upload.js` |

### `/api/user-activity` (4)

| Method | Path đầy đủ | File |
|---|---|---|
| POST | `/api/user-activity/` | `userActivityLog.js` |
| GET | `/api/user-activity/:userId` | `userActivityLog.js` |
| GET | `/api/user-activity/me` | `userActivityLog.js` |
| GET | `/api/user-activity/summary` | `userActivityLog.js` |

### `/api/users` (21)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/users/` | `users.js` |
| POST | `/api/users/` | `users.js` |
| DELETE | `/api/users/:id` | `users.js` |
| GET | `/api/users/:id` | `users.js` |
| PUT | `/api/users/:id` | `users.js` |
| DELETE | `/api/users/:id/permanent` | `users.js` |
| GET | `/api/users/activity` | `users.js` |
| POST | `/api/users/ai-fill-form` | `users.js` |
| GET | `/api/users/crm-app-prefs` | `users.js` |
| PUT | `/api/users/crm-app-prefs` | `users.js` |
| GET | `/api/users/departments` | `users.js` |
| GET | `/api/users/departments/list` | `users.js` |
| GET | `/api/users/locations` | `users.js` |
| DELETE | `/api/users/me/location` | `users.js` |
| GET | `/api/users/me/location` | `users.js` |
| GET | `/api/users/my-stages` | `users.js` |
| POST | `/api/users/ping` | `users.js` |
| POST | `/api/users/presence` | `users.js` |
| GET | `/api/users/sidebar-menu-pins` | `users.js` |
| PUT | `/api/users/sidebar-menu-pins` | `users.js` |
| GET | `/api/users/stages` | `users.js` |

### `/api/vc-handover` (6)

| Method | Path đầy đủ | File |
|---|---|---|
| PATCH | `/api/vc-handover/comments/:cid/confirm` | `vcHandover.js` |
| PATCH | `/api/vc-handover/comments/:cid/reschedule` | `vcHandover.js` |
| PATCH | `/api/vc-handover/comments/:cid/schedule` | `vcHandover.js` |
| PATCH | `/api/vc-handover/comments/:cid/select` | `vcHandover.js` |
| GET | `/api/vc-handover/io` | `vcHandover.js` |
| POST | `/api/vc-handover/projects/:id/request` | `vcHandover.js` |

### `/api/voice-recordings` (15)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/voice-recordings/` | `voiceRecordings.js` |
| POST | `/api/voice-recordings/` | `voiceRecordings.js` |
| DELETE | `/api/voice-recordings/:id` | `voiceRecordings.js` |
| PATCH | `/api/voice-recordings/:id` | `voiceRecordings.js` |
| POST | `/api/voice-recordings/:id/bootstrap-crm` | `voiceRecordings.js` |
| POST | `/api/voice-recordings/:id/transcribe` | `voiceRecordings.js` |
| POST | `/api/voice-recordings/bulk-check` | `voiceRecordings.js` |
| POST | `/api/voice-recordings/classify-prospects` | `voiceRecordings.js` |
| GET | `/api/voice-recordings/crm-lead-options` | `voiceRecordings.js` |
| GET | `/api/voice-recordings/exists` | `voiceRecordings.js` |
| POST | `/api/voice-recordings/match-phones` | `voiceRecordings.js` |
| GET | `/api/voice-recordings/phone-preview` | `voiceRecordings.js` |
| POST | `/api/voice-recordings/relink-unassigned` | `voiceRecordings.js` |
| POST | `/api/voice-recordings/scan-duplicates` | `voiceRecordings.js` |
| POST | `/api/voice-recordings/scan-metadata-phones` | `voiceRecordings.js` |

### `/api/work-tasks` (10)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/work-tasks/` | `workTasks.js` |
| POST | `/api/work-tasks/` | `workTasks.js` |
| DELETE | `/api/work-tasks/:source/:id` | `workTasks.js` |
| PATCH | `/api/work-tasks/:source/:id` | `workTasks.js` |
| POST | `/api/work-tasks/:source/:id/comment` | `workTasks.js` |
| GET | `/api/work-tasks/by-project/:projectId` | `workTasks.js` |
| GET | `/api/work-tasks/history` | `workTasks.js` |
| GET | `/api/work-tasks/lead-options` | `workTasks.js` |
| GET | `/api/work-tasks/summary` | `workTasks.js` |
| POST | `/api/work-tasks/task/:id/checklists/:cid/toggle` | `workTasks.js` |

### `/api/workshop` (4)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/workshop/project-types` | `workshopTypes.js` |
| POST | `/api/workshop/project-types` | `workshopTypes.js` |
| DELETE | `/api/workshop/project-types/:id` | `workshopTypes.js` |
| PUT | `/api/workshop/project-types/:id` | `workshopTypes.js` |

### `/api/workshop-teams` (9)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/workshop-teams/` | `workshopTeams.js` |
| POST | `/api/workshop-teams/` | `workshopTeams.js` |
| DELETE | `/api/workshop-teams/:id` | `workshopTeams.js` |
| PUT | `/api/workshop-teams/:id` | `workshopTeams.js` |
| POST | `/api/workshop-teams/:id/members` | `workshopTeams.js` |
| DELETE | `/api/workshop-teams/:id/members/:userId` | `workshopTeams.js` |
| GET | `/api/workshop-teams/io` | `workshopTeams.js` |
| PATCH | `/api/workshop-teams/projects/:projectId/assign` | `workshopTeams.js` |
| GET | `/api/workshop-teams/users` | `workshopTeams.js` |

### `/api/zalo` (36)

| Method | Path đầy đủ | File |
|---|---|---|
| GET | `/api/zalo/accounts` | `zalo.js` |
| POST | `/api/zalo/accounts` | `zalo.js` |
| DELETE | `/api/zalo/accounts/:id` | `zalo.js` |
| GET | `/api/zalo/accounts/:id` | `zalo.js` |
| PUT | `/api/zalo/accounts/:id` | `zalo.js` |
| POST | `/api/zalo/accounts/:id/refresh-token` | `zalo.js` |
| GET | `/api/zalo/auto-tool/config` | `zalo.js` |
| PUT | `/api/zalo/auto-tool/config` | `zalo.js` |
| POST | `/api/zalo/auto-tool/start` | `zalo.js` |
| GET | `/api/zalo/auto-tool/status` | `zalo.js` |
| POST | `/api/zalo/auto-tool/stop` | `zalo.js` |
| POST | `/api/zalo/batch-apply-oa-routing` | `zalo.js` |
| POST | `/api/zalo/batch-create-leads` | `zalo.js` |
| POST | `/api/zalo/batch-extract-phones` | `zalo.js` |
| POST | `/api/zalo/batch-scan-and-create-leads` | `zalo.js` |
| GET | `/api/zalo/contacts` | `zalo.js` |
| DELETE | `/api/zalo/contacts/:id` | `zalo.js` |
| GET | `/api/zalo/contacts/:id` | `zalo.js` |
| PUT | `/api/zalo/contacts/:id` | `zalo.js` |
| POST | `/api/zalo/contacts/:id/apply-oa-routing` | `zalo.js` |
| POST | `/api/zalo/contacts/:id/create-lead` | `zalo.js` |
| PUT | `/api/zalo/contacts/:id/link-lead` | `zalo.js` |
| GET | `/api/zalo/contacts/:id/messages` | `zalo.js` |
| POST | `/api/zalo/contacts/:id/messages` | `zalo.js` |
| POST | `/api/zalo/contacts/:id/sync-profile` | `zalo.js` |
| GET | `/api/zalo/integrations/n8n/o/:token` | `zalo.js` |
| GET | `/api/zalo/integrations/n8n/o/:token/sync-profile` | `zalo.js` |
| POST | `/api/zalo/integrations/n8n/o/:token/sync-profile` | `zalo.js` |
| GET | `/api/zalo/integrations/n8n/sync-profile` | `zalo.js` |
| POST | `/api/zalo/integrations/n8n/sync-profile` | `zalo.js` |
| GET | `/api/zalo/leads/:leadId/messages` | `zalo.js` |
| POST | `/api/zalo/refresh-profiles` | `zalo.js` |
| GET | `/api/zalo/stats` | `zalo.js` |
| GET | `/api/zalo/webhook` | `zalo.js` |
| POST | `/api/zalo/webhook` | `zalo.js` |
| GET | `/api/zalo/webhook-info` | `zalo.js` |

---

## 4. External API (body)

Xem header `backend/src/routes/external.js`.

| Method | Path | Body chính |
|---|---|---|
| POST | /api/external/leads | title*, phone*, type?, full_name?, email?, source_name?, stage_id?, assigned_to?, company_id?, estimated_value?, description?, notes?, webhook_url? |
| POST | /api/external/deals | tương tự leads |
| GET | /api/external/stages | query type=lead\|deal |
| GET | /api/external/sources | — |
| GET | /api/external/users | — |
| GET | /api/external/ping | — |
| GET | /api/external/leads/stats | — |

---

## 5. CRM clusters

Sửa trong `backend/src/routes/crm/routes/`:


---

## 6. Liên quan

- `docs/project/CODING_STANDARD.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/architecture/kien-truc-tong-the.html`
