import { Skybridge, requireBearerAuth, type McpExtra, OAuthError, OAuthErrorCode } from 'skybridge/server';
import { z } from 'zod';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validate } = require('../../../backend/src/modules/founderControl/contracts.js');
import { forward, verifyKey } from './bridge.js';
const uuid = z.string().uuid();
const period = { company_id: uuid, window_start: z.string().datetime({ offset: true }), window_end: z.string().datetime({ offset: true }) };
const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true };
const write = { ...read, readOnlyHint: false };
const view = { component: 'founder-control' as const, description: 'Tình hình, bằng chứng và mục tiêu theo sáu hệ; dữ liệu thiếu được ghi rõ.' };
const tokenOf = (extra: McpExtra) => extra.http?.authInfo?.token;
export const app = new Skybridge({
  name: 'founder-control-center', version: '0.1.0',
  instructions: 'Executive AI Interface cho Business AI OS. Không suy dữ liệu thiếu thành 0, approval thành execution hoặc synthetic thành production. Backend quyết định tenant/quyền; không cung cấp actor/role trong arguments.',
  handler: server => server
    .mcpMiddleware('tools/call', async (request, extra, next) => {
      const writeTool = ['create_founder_objective','record_founder_decision'].includes(request.params.name);
      if (!extra.http?.authInfo?.scopes.includes(writeTool ? 'founder_write' : 'founder_read')) return { isError: true, content: [{ type: 'text', text: 'PERMISSION_DENIED' }] };
      try { validate(request.params.name, request.params.arguments); }
      catch { return { isError: true, content: [{ type: 'text', text: 'INVALID_ARGUMENTS' }] }; }
      return next();
    })
    .registerTool({ name: 'get_founder_overview', description: 'Xem Marketing → CRM theo sáu hệ và bằng chứng nguồn.', inputSchema: period, annotations: read, securitySchemes: [{ type: 'oauth2', scopes: ['founder_read'] }], view },
      (args, extra) => forward('get_founder_overview', args, tokenOf(extra)))
    .registerTool({ name: 'get_founder_evidence', description: 'Truy bằng chứng CRM và SLA của một khách theo quyền.', inputSchema: { ...period, lead_id: uuid }, annotations: read, securitySchemes: [{ type: 'oauth2', scopes: ['founder_read'] }], view: { ...view, component: 'founder-evidence' as const } },
      (args, extra) => forward('get_founder_evidence', args, tokenOf(extra)))
    .registerTool({ name: 'get_founder_objectives', description: 'Theo dõi mục tiêu và quyết định đã lưu; không tự thực thi.', inputSchema: period, annotations: read, securitySchemes: [{ type: 'oauth2', scopes: ['founder_read'] }], view: { ...view, component: 'founder-objectives' as const } },
      (args, extra) => forward('get_founder_objectives', args, tokenOf(extra)))
    .registerTool({ name: 'create_founder_objective', description: 'Ghi mục tiêu theo quyền ủy quyền và idempotency; cần founder_write.', inputSchema: { ...period,
      request_id: z.string().min(8).max(100), owner_id: uuid, title: z.string().min(1).max(200),
      metric: z.enum(['QUALIFIED_PAID_LEADS', 'FIRST_RESPONSE_SLA']), target: z.number().min(0).max(1000000000) }, annotations: write, securitySchemes: [{ type: 'oauth2', scopes: ['founder_write'] }] },
      (args, extra) => forward('create_founder_objective', args, tokenOf(extra)))
    .registerTool({ name: 'record_founder_decision', description: 'Ghi approve/reject theo proposal_id/version/digest; không execute.', inputSchema: { company_id: uuid,
      request_id: z.string().min(8).max(100), proposal_id: uuid, expected_version: z.number().int().positive(), expected_digest: z.string().regex(/^[a-f0-9]{64}$/),
      decision: z.enum(['APPROVE','REJECT']), reason: z.string().min(1).max(500) }, annotations: write, securitySchemes: [{ type: 'oauth2', scopes: ['founder_write'] }] },
      (args, extra) => forward('record_founder_decision', args, tokenOf(extra))),
});
// Reuse current API-key identity. No shared backend key and no invented OAuth provider.
// ChatGPT production OAuth discovery/token exchange is a release prerequisite.
app.express.use('/mcp', requireBearerAuth({ verifier: { verifyAccessToken: async token => {
  try { return await verifyKey(token); }
  catch { throw new OAuthError(OAuthErrorCode.InvalidToken, 'AUTHENTICATION_DENIED'); }
} } }));
export type AppType = typeof app;
