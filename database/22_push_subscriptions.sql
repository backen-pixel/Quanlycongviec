-- 22_push_subscriptions.sql
-- Push subscriptions for web push notifications
-- Notification preferences per user

-- Push subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, endpoint)
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_sub_service_all" ON push_subscriptions FOR ALL USING (true);

-- Notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  browser_push BOOLEAN DEFAULT true,
  sound BOOLEAN DEFAULT true,
  -- Notification types
  task_assigned BOOLEAN DEFAULT true,
  task_completed BOOLEAN DEFAULT true,
  deadline_warning BOOLEAN DEFAULT true,
  comment_added BOOLEAN DEFAULT true,
  stage_changed BOOLEAN DEFAULT true,
  deal_won BOOLEAN DEFAULT true,
  approval_request BOOLEAN DEFAULT true,
  checklist_completed BOOLEAN DEFAULT true,
  lead_assigned BOOLEAN DEFAULT true,
  order_confirmed BOOLEAN DEFAULT true,
  invoice_overdue BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_prefs_service_all" ON notification_preferences FOR ALL USING (true);
