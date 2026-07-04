/**
 * Skill Workshop — đề xuất → duyệt → live (OpenClaw-style).
 */
const { supabase } = require('../config/supabase');
const { isAdminLike } = require('./adminRole');
const { savePendingSchedule, clearPendingSchedule } = require('./aiBotSchedulePending');
const { startScheduleConfirmFlow, cancelFlowForChannel } = require('./aiBotTaskFlow');

const PROPOSAL_TTL_DAYS = 7;

function scheduleArgsFromProposal(proposal) {
  const cfg = proposal.config || {};
  return {
    report_type: cfg.report_type || 'org_overview',
    company_id: cfg.company_id,
    company_name: cfg.company_name,
    department_id: cfg.department_id,
    department_name: cfg.department_name,
    channel_type: proposal.channel_type || cfg.channel_type,
    channel_id: proposal.channel_id || cfg.channel_id,
    run_times: cfg.run_times || cfg.run_slots,
    time_scope: cfg.time_scope || 'today',
    title: proposal.title,
    note: proposal.summary,
    instruction: proposal.instruction || proposal.summary,
    weekdays: cfg.weekdays,
    enabled: cfg.enabled !== false,
  };
}

function pendingArgsFromProposal(proposal) {
  return scheduleArgsFromProposal(proposal);
}

async function insertProposal(row) {
  const expires = new Date(Date.now() + PROPOSAL_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('ai_bot_skill_proposals')
    .insert({ ...row, expires_at: expires, updated_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) {
    if (/relation .* does not exist/i.test(error.message || '')) {
      throw new Error('Chưa chạy migration 509_ai_bot_skill_workshop.sql');
    }
    throw new Error(error.message);
  }
  return data;
}

async function enrichProposal(row) {
  if (!row) return row;
  const { data: proposer } = await supabase
    .from('users')
    .select('id, full_name, email')
    .eq('id', row.proposer_user_id)
    .maybeSingle();
  const { data: reviewer } = row.reviewed_by
    ? await supabase.from('users').select('id, full_name').eq('id', row.reviewed_by).maybeSingle()
    : { data: null };
  return {
    ...row,
    proposer,
    reviewer,
  };
}

async function listSkillProposals({ status, user_id: userId, limit = 50 } = {}) {
  let q = supabase
    .from('ai_bot_skill_proposals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 200));
  if (status) q = q.eq('status', status);
  if (userId) q = q.eq('proposer_user_id', userId);
  const { data, error } = await q;
  if (error) {
    if (/relation .* does not exist/i.test(error.message || '')) {
      return { proposals: [], total: 0, hint: 'Chạy migration database/509_ai_bot_skill_workshop.sql' };
    }
    throw new Error(error.message);
  }
  const rows = await Promise.all((data || []).map(enrichProposal));
  return { proposals: rows, total: rows.length };
}

async function getProposalById(id) {
  const { data, error } = await supabase
    .from('ai_bot_skill_proposals')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? enrichProposal(data) : null;
}

/**
 * Preview + tạo proposal pending. Admin: thêm pending_schedule + task flow.
 */
async function proposeSkillSchedule(args, ctx) {
  const { loadCtxUser, buildSchedulePayload, formatSlotsLabel } = require('./aiBotSkills');
  const user = await loadCtxUser(ctx);
  if (!user) throw new Error('Không xác định được người dùng');

  const admin = isAdminLike(user);
  const payload = await buildSchedulePayload(args, ctx, user);
  if (payload.error) return payload;

  const config = {
    report_type: payload._meta.report_type,
    company_id: payload._meta.company_id,
    department_id: payload._meta.department_id,
    company_name: args.company_name,
    department_name: args.department_name,
    channel_type: payload.channel_type,
    channel_id: payload.channel_id,
    run_times: formatSlotsLabel(payload.run_slots).split(', ').filter(Boolean),
    time_scope: payload.time_scope,
    weekdays: payload.weekdays,
    enabled: payload.enabled,
  };

  let proposal;
  try {
    proposal = await insertProposal({
      proposer_user_id: user.id,
      channel_type: payload.channel_type,
      channel_id: payload.channel_id,
      proposal_type: 'scheduled_report',
      title: payload.title,
      summary: args.note || args.instruction || null,
      instruction: args.instruction || null,
      config,
      status: 'pending',
    });
  } catch (e) {
    if (/relation .* does not exist/i.test(e.message || '')) {
      if (admin) {
        const { createAiBotSchedule } = require('./aiBotSkills');
        return createAiBotSchedule({ ...args, dry_run: true }, ctx);
      }
      throw new Error('Chưa chạy migration database/509_ai_bot_skill_workshop.sql — nhờ admin chạy SQL trên Primary.');
    }
    throw e;
  }

  let flowId = null;
  if (admin) {
    const pendingArgs = pendingArgsFromProposal({ ...proposal, config });
    pendingArgs.proposal_id = proposal.id;
    pendingArgs.flow_id = null;
    await savePendingSchedule(ctx, pendingArgs);
    const flow = await startScheduleConfirmFlow({
      userId: user.id,
      channelKind: payload.channel_type,
      channelId: payload.channel_id,
      proposalId: proposal.id,
      scheduleArgs: pendingArgs,
      preview: {
        title: payload.title,
        report_type: payload._meta.report_type,
        run_times: payload.run_slots,
        time_scope: payload.time_scope,
      },
    });
    flowId = flow?.id;
    if (flowId && pendingArgs) {
      pendingArgs.flow_id = flowId;
      await savePendingSchedule(ctx, pendingArgs);
    }
  }

  const lines = [
    '📋 *Đề xuất lịch bot* (Skill Workshop)',
    `• Tiêu đề: ${payload.title}`,
    `• Loại: ${payload._meta.report_type}`,
    `• Giờ gửi: ${formatSlotsLabel(payload.run_slots)} (giờ VN)`,
    `• Kỳ: ${payload.time_scope}`,
    `• Mã đề xuất: \`${proposal.id.slice(0, 8)}\``,
  ];
  if (admin) {
    lines.push('', '👉 Trả lời **OK** / **tạo lịch** để tạo ngay.');
    lines.push('👉 Trả lời **huỷ** để bỏ.');
  } else {
    lines.push('', '⏳ Đã gửi admin duyệt — theo dõi tại Cài đặt → AI Chat Bot → Workshop.');
  }

  return {
    ok: true,
    proposal_id: proposal.id,
    flow_id: flowId,
    pending_saved: admin,
    text: lines.join('\n'),
  };
}

async function approveSkillProposal(proposalId, reviewerCtx, { note } = {}) {
  const { loadCtxUser, createAiBotSchedule } = require('./aiBotSkills');
  const reviewer = await loadCtxUser(reviewerCtx);
  if (!reviewer || !isAdminLike(reviewer)) {
    throw new Error('Chỉ admin mới duyệt đề xuất');
  }

  const { data: proposal, error: fetchErr } = await supabase
    .from('ai_bot_skill_proposals')
    .select('*')
    .eq('id', proposalId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!proposal) throw new Error('Không tìm thấy đề xuất');
  if (proposal.status !== 'pending') throw new Error(`Đề xuất đang ở trạng thái "${proposal.status}"`);

  const result = await createAiBotSchedule(
    {
      ...scheduleArgsFromProposal(proposal),
      dry_run: false,
      skip_pending_save: true,
      created_by_user_id: proposal.proposer_user_id,
      proposal_id: proposal.id,
    },
    { ...reviewerCtx, sender_user_id: reviewer.id },
  );
  if (result.error) return result;

  const patch = {
    status: 'approved',
    reviewed_by: reviewer.id,
    reviewed_at: new Date().toISOString(),
    review_note: note || null,
    schedule_id: result.schedule?.id || null,
    skill_id: result.skill_id || null,
    updated_at: new Date().toISOString(),
  };
  await supabase.from('ai_bot_skill_proposals').update(patch).eq('id', proposalId);

  if (proposal.channel_type && proposal.channel_id) {
    await clearPendingSchedule(proposal.channel_type, proposal.channel_id);
    await cancelFlowForChannel(proposal.channel_type, proposal.channel_id, 'completed');
  }

  return {
    ok: true,
    proposal_id: proposalId,
    schedule: result.schedule,
    text: result.text || '✅ Đã duyệt và tạo lịch bot.',
  };
}

async function rejectSkillProposal(proposalId, reviewerCtx, { note } = {}) {
  const { loadCtxUser } = require('./aiBotSkills');
  const reviewer = await loadCtxUser(reviewerCtx);
  if (!reviewer || !isAdminLike(reviewer)) {
    throw new Error('Chỉ admin mới từ chối đề xuất');
  }

  const { data: proposal } = await supabase
    .from('ai_bot_skill_proposals')
    .select('*')
    .eq('id', proposalId)
    .maybeSingle();
  if (!proposal) throw new Error('Không tìm thấy đề xuất');
  if (proposal.status !== 'pending') throw new Error(`Đề xuất đang ở trạng thái "${proposal.status}"`);

  await supabase
    .from('ai_bot_skill_proposals')
    .update({
      status: 'rejected',
      reviewed_by: reviewer.id,
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', proposalId);

  if (proposal.channel_type && proposal.channel_id) {
    await clearPendingSchedule(proposal.channel_type, proposal.channel_id);
    await cancelFlowForChannel(proposal.channel_type, proposal.channel_id, 'cancelled');
  }

  return {
    ok: true,
    text: `❌ Đã từ chối đề xuất «${proposal.title}»${note ? `: ${note}` : ''}`,
  };
}

async function markProposalAutoApproved(proposalId, { scheduleId, skillId } = {}) {
  if (!proposalId) return;
  await supabase
    .from('ai_bot_skill_proposals')
    .update({
      status: 'auto_approved',
      schedule_id: scheduleId || null,
      skill_id: skillId || null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', proposalId)
    .eq('status', 'pending');
}

async function manageSkillProposals(args, ctx) {
  const action = args.action || 'list';
  switch (action) {
    case 'list':
      return listSkillProposals({
        status: args.status || null,
        user_id: args.mine_only ? ctx.sender_user_id : args.user_id,
        limit: args.limit,
      });
    case 'propose':
      return proposeSkillSchedule(args, ctx);
    case 'approve':
      return approveSkillProposal(args.proposal_id, ctx, { note: args.note });
    case 'reject':
      return rejectSkillProposal(args.proposal_id, ctx, { note: args.note });
    default:
      return { error: `action không hợp lệ: ${action}` };
  }
}

module.exports = {
  proposeSkillSchedule,
  approveSkillProposal,
  rejectSkillProposal,
  markProposalAutoApproved,
  listSkillProposals,
  getProposalById,
  manageSkillProposals,
};
