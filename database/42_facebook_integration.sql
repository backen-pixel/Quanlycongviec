-- ═══════════════════════════════════════════════════════════════
-- 42. FACEBOOK INTEGRATION — Lead Ads + Messenger + Comments
-- ═══════════════════════════════════════════════════════════════

-- 1. Facebook Pages config (lưu token, page_id)
CREATE TABLE IF NOT EXISTS facebook_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id TEXT NOT NULL UNIQUE,
  page_name TEXT,
  access_token TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  webhook_verify_token TEXT,
  auto_create_lead BOOLEAN DEFAULT true,
  auto_reply_message TEXT DEFAULT 'Cảm ơn bạn đã liên hệ! Chúng tôi sẽ phản hồi sớm nhất.',
  default_pipeline_id UUID,
  default_stage_id UUID,
  default_source_id UUID,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Facebook contacts (mapping PSID ↔ Lead/Customer)
CREATE TABLE IF NOT EXISTS facebook_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id TEXT NOT NULL,
  psid TEXT NOT NULL,
  fb_name TEXT,
  fb_profile_pic TEXT,
  phone TEXT,
  email TEXT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  unread_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(page_id, psid)
);

-- 3. Facebook messages (lịch sử chat Messenger)
CREATE TABLE IF NOT EXISTS facebook_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES facebook_contacts(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  fb_message_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'audio', 'file', 'location', 'sticker', 'template')),
  content TEXT,
  attachment_url TEXT,
  attachment_type TEXT,
  attachment_local_path TEXT,
  metadata JSONB,
  sent_by UUID REFERENCES users(id),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Facebook lead ads (dữ liệu form Lead Ads)
CREATE TABLE IF NOT EXISTS facebook_lead_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id TEXT NOT NULL,
  leadgen_id TEXT NOT NULL UNIQUE,
  form_id TEXT,
  form_name TEXT,
  field_data JSONB,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  raw_data JSONB,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Facebook comments (bình luận trên post)
CREATE TABLE IF NOT EXISTS facebook_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id TEXT NOT NULL,
  post_id TEXT,
  comment_id TEXT NOT NULL UNIQUE,
  parent_comment_id TEXT,
  from_id TEXT,
  from_name TEXT,
  message TEXT,
  attachment_url TEXT,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  replied BOOLEAN DEFAULT false,
  reply_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fb_contacts_psid ON facebook_contacts(page_id, psid);
CREATE INDEX IF NOT EXISTS idx_fb_contacts_lead ON facebook_contacts(lead_id);
CREATE INDEX IF NOT EXISTS idx_fb_contacts_customer ON facebook_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_fb_messages_contact ON facebook_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_fb_messages_lead ON facebook_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_fb_messages_created ON facebook_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fb_lead_ads_page ON facebook_lead_ads(page_id);
CREATE INDEX IF NOT EXISTS idx_fb_comments_post ON facebook_comments(post_id);

-- RLS
ALTER TABLE facebook_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_lead_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fb_pages_all" ON facebook_pages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "fb_contacts_all" ON facebook_contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "fb_messages_all" ON facebook_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "fb_lead_ads_all" ON facebook_lead_ads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "fb_comments_all" ON facebook_comments FOR ALL USING (true) WITH CHECK (true);

-- Add source "Facebook" if not exists
INSERT INTO crm_sources (name, icon) 
VALUES ('Facebook', '📘')
ON CONFLICT DO NOTHING;
