import { z } from 'zod';
const resultSchema = z.object({
  contract_version: z.literal('founder-control/v1'),
  outcome: z.enum(['OK', 'PARTIAL']), coverage: z.enum(['COMPLETE', 'PARTIAL', 'UNKNOWN']),
  fetched_at: z.string().datetime(), source_as_of: z.string().nullable(), synthetic: z.boolean(),
  scope: z.object({ company_id: z.string().uuid(), tenant_id: z.string().uuid() }),
  window: z.object({ start: z.string(), end: z.string(), timezone: z.string() }).nullable(),
  source_refs: z.array(z.object({ ref: z.string(), status: z.string(), coverage: z.string(), reason: z.string().nullable(), source_as_of: z.string().nullable(), last_sync_observed_at: z.string().nullable().optional(), freshness: z.string() })),
  data: z.record(z.string(), z.unknown()),
});
export type Result = z.infer<typeof resultSchema>;
export type ErrorResult = { outcome: 'ERROR'; reason: 'AUTHENTICATION_REQUIRED' | 'BACKEND_UNAVAILABLE' };
function toolError(reason: ErrorResult['reason']) { return { isError: true as const, structuredContent: { outcome: 'ERROR' as const, reason }, content: [{ type: 'text' as const, text: 'Không lấy được dữ liệu. Kiểm tra quyền và trạng thái backend; không coi lỗi là số 0.' }] }; }
export type Fetcher = typeof fetch;
export function backendUrl() {
  const url = new URL(process.env.FOUNDER_BACKEND_URL || 'http://127.0.0.1:4000');
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('BACKEND_URL_INVALID');
  return url.origin;
}
export async function verifyKey(token: string, fetcher: Fetcher = fetch) {
  const response = await fetcher(`${backendUrl()}/api/mcp/tools`, {
    headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('AUTHENTICATION_DENIED');
  const body = await response.json() as { tools?: { name: string }[] };
  if (!body.tools?.some(t => ['get_founder_overview','get_founder_evidence','get_founder_objectives','create_founder_objective','record_founder_decision'].includes(t.name))) throw new Error('FOUNDER_SCOPE_REQUIRED');
  return { token, clientId: 'founder-control-center', expiresAt: Math.floor(Date.now() / 1000) + 30, scopes: [ ...(body.tools?.some(t => t.name === 'get_founder_overview') ? ['founder_read'] : []), ...(body.tools?.some(t => t.name === 'create_founder_objective') ? ['founder_write'] : []) ] };
}
export async function forward(name: string, args: object, token: string | undefined, fetcher: Fetcher = fetch) {
  if (!token) return toolError('AUTHENTICATION_REQUIRED');
  try {
    const r = await fetcher(`${backendUrl()}/api/mcp/tools/call`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, arguments: args }), redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(r.status === 403 ? 'PERMISSION_DENIED' : 'BACKEND_UNAVAILABLE');
    const body = await r.json() as { isError?: boolean; structuredContent?: unknown; content?: { type: string; text?: string }[] };
    if (body.isError) throw new Error('BACKEND_TOOL_FAILED');
    const data = body.structuredContent ?? JSON.parse(body.content?.find(c => c.type === 'text')?.text || 'null');
    const parsed = resultSchema.parse(data);
    return { structuredContent: parsed, content: [{ type: 'text' as const,
      text: `${parsed.synthetic ? 'DỮ LIỆU MẪU · ' : ''}${parsed.outcome === 'PARTIAL' ? 'Thiếu dữ liệu' : name.startsWith('get_') ? 'Đã đọc dữ liệu' : 'Đã ghi nhận mục tiêu/quyết định'}; chưa thực thi quảng cáo hoặc gửi thông báo.` }] };
  } catch {
    // No raw upstream response, customer text, stack or token reaches the model/UI.
    return toolError('BACKEND_UNAVAILABLE');
  }
}
