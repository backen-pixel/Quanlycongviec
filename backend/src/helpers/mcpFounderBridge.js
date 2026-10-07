'use strict';
const { TOOL_SET, getTools } = require('../modules/founderControl/contracts');
const { createFounderControl } = require('../modules/founderControl/service');
function getMcpFounderTools(apiKey) {
  return process.env.FOUNDER_CONTROL_ENABLED === '1' ? getTools(apiKey) : [];
}
async function callMcpFounderTool(name, args, req) {
  const { supabase } = require('../config/supabase');
  const { getActiveTarget, withPrimaryDatabase } = require('../config/supabaseRouter');
  const service = createFounderControl({ db: supabase, isPrimary: () => getActiveTarget() === 'primary',
    slaCompanyId: process.env.FOUNDER_VPT_COMPANY_ID || null,
    enabled: () => process.env.FOUNDER_CONTROL_ENABLED === '1',
    writesEnabled: () => process.env.FOUNDER_CONTROL_WRITES_ENABLED === '1' });
  // Pin both reads and commands; never silently redirect delegated writes to Backup.
  return withPrimaryDatabase(() => service.call(name, args, req));
}
module.exports = { MCP_FOUNDER_TOOL_SET: TOOL_SET, getMcpFounderTools, callMcpFounderTool };
