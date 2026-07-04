-- 509_ai_bot_skill_workshop.sql
-- Skill Workshop (đề xuất → duyệt) + Task Flow orchestration.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS ai_bot_skill_proposals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_type      TEXT CHECK (channel_type IN ('department', 'group')),
  channel_id        UUID,

  proposal_type     TEXT NOT NULL DEFAULT 'scheduled_report'
    CHECK (proposal_type IN ('scheduled_report', 'preference', 'instruction', 'library_skill')),

  title             TEXT NOT NULL,
  summary           TEXT,
  instruction       TEXT,
  config            JSONB NOT NULL DEFAULT '{}',

  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'auto_approved')),

  review_note       TEXT,
  reviewed_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,

  skill_id          UUID REFERENCES ai_bot_user_skills(id) ON DELETE SET NULL,
  schedule_id       UUID REFERENCES ai_chat_bot_schedules(id) ON DELETE SET NULL,

  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_bot_proposals_status
  ON ai_bot_skill_proposals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_bot_proposals_proposer
  ON ai_bot_skill_proposals(proposer_user_id, created_at DESC);

COMMENT ON TABLE ai_bot_skill_proposals IS
  'Skill Workshop — đề xuất kỹ năng/lịch bot chờ admin duyệt (OpenClaw-style).';

CREATE TABLE IF NOT EXISTS ai_bot_task_flows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_type    TEXT NOT NULL CHECK (channel_type IN ('department', 'group')),
  channel_id      UUID NOT NULL,

  flow_type       TEXT NOT NULL DEFAULT 'schedule_confirm'
    CHECK (flow_type IN ('schedule_confirm', 'skill_proposal', 'multi_step')),

  status          TEXT NOT NULL DEFAULT 'waiting_user'
    CHECK (status IN ('active', 'waiting_user', 'completed', 'cancelled', 'failed')),

  current_step    TEXT NOT NULL DEFAULT 'confirm',
  steps           JSONB NOT NULL DEFAULT '[]'::jsonb,
  context         JSONB NOT NULL DEFAULT '{}'::jsonb,
  resume_token    TEXT,

  proposal_id     UUID REFERENCES ai_bot_skill_proposals(id) ON DELETE SET NULL,

  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_bot_task_flows_channel
  ON ai_bot_task_flows(channel_type, channel_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_bot_task_flows_user
  ON ai_bot_task_flows(user_id, status, updated_at DESC);

COMMENT ON TABLE ai_bot_task_flows IS
  'Task Flow — workflow nhiều bước (xác nhận lịch, duyệt skill…) durable qua restart.';

-- Snapshot skill library per conversation (OpenClaw session snapshot)
ALTER TABLE ai_chat_bot_conversations
  ADD COLUMN IF NOT EXISTS skill_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN ai_chat_bot_conversations.skill_snapshot IS
  'Danh sách skill codes snapshot lúc mở phiên — ổn định trong session.';

COMMIT;
