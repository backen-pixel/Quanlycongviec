/**
 * Task Flow — workflow nhiều bước durable (OpenClaw Task Flow lite).
 */
const { supabase } = require('../config/supabase');
const crypto = require('crypto');

const FLOW_TTL_MS = 15 * 60 * 1000;

function newResumeToken() {
  return crypto.randomBytes(12).toString('hex');
}

async function getActiveFlow(channelKind, channelId, userId) {
  const now = new Date().toISOString();
  let q = supabase
    .from('ai_bot_task_flows')
    .select('*')
    .eq('channel_type', channelKind)
    .eq('channel_id', channelId)
    .in('status', ['active', 'waiting_user'])
    .gt('expires_at', now)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q.maybeSingle();
  if (error && !/relation .* does not exist/i.test(error.message || '')) {
    throw new Error(error.message);
  }
  return data || null;
}

async function startScheduleConfirmFlow({
  userId,
  channelKind,
  channelId,
  proposalId,
  scheduleArgs,
  preview,
}) {
  await cancelFlowForChannel(channelKind, channelId, 'cancelled');

  const row = {
    user_id: userId,
    channel_type: channelKind,
    channel_id: channelId,
    flow_type: 'schedule_confirm',
    status: 'waiting_user',
    current_step: 'confirm',
    steps: [
      { id: 'preview', done: true, at: new Date().toISOString() },
      { id: 'confirm', done: false },
      { id: 'create', done: false },
    ],
    context: { schedule_args: scheduleArgs, preview, proposal_id: proposalId || null },
    resume_token: newResumeToken(),
    proposal_id: proposalId || null,
    expires_at: new Date(Date.now() + FLOW_TTL_MS).toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('ai_bot_task_flows')
    .insert(row)
    .select('*')
    .single();
  if (error) {
    if (/relation .* does not exist/i.test(error.message || '')) return null;
    throw new Error(error.message);
  }
  return data;
}

async function completeFlow(flowId, { status = 'completed' } = {}) {
  if (!flowId) return;
  await supabase
    .from('ai_bot_task_flows')
    .update({
      status,
      current_step: 'done',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', flowId);
}

async function cancelFlowForChannel(channelKind, channelId, status = 'cancelled') {
  const now = new Date().toISOString();
  await supabase
    .from('ai_bot_task_flows')
    .update({
      status,
      updated_at: now,
      completed_at: status === 'completed' ? now : null,
    })
    .eq('channel_type', channelKind)
    .eq('channel_id', channelId)
    .in('status', ['active', 'waiting_user']);
}

async function listTaskFlows({ status, channelKind, channelId, userId, limit = 50 } = {}) {
  let q = supabase
    .from('ai_bot_task_flows')
    .select('*, user:users(id, full_name)')
    .order('updated_at', { ascending: false })
    .limit(Math.min(limit, 200));
  if (status) q = q.eq('status', status);
  if (channelKind) q = q.eq('channel_type', channelKind);
  if (channelId) q = q.eq('channel_id', channelId);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) {
    if (/relation .* does not exist/i.test(error.message || '')) {
      return { flows: [], total: 0, hint: 'Chạy migration database/393_ai_bot_skill_workshop.sql' };
    }
    throw new Error(error.message);
  }
  return { flows: data || [], total: (data || []).length };
}

module.exports = {
  getActiveFlow,
  startScheduleConfirmFlow,
  completeFlow,
  cancelFlowForChannel,
  listTaskFlows,
  FLOW_TTL_MS,
};
