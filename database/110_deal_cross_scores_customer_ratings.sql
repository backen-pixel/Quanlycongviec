-- Chấm điểm chéo giữa các module trên cùng một Deal + sao từ KH + cấu hình thưởng/phạt

CREATE TABLE IF NOT EXISTS deal_cross_module_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  source_module TEXT NOT NULL,
  target_module TEXT NOT NULL,
  criterion TEXT NOT NULL DEFAULT 'overall',
  score NUMERIC NOT NULL CHECK (score >= 1 AND score <= 5),
  comment TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT deal_cross_diff_modules CHECK (source_module <> target_module),
  UNIQUE(deal_lead_id, source_module, target_module, criterion, created_by)
);

CREATE INDEX IF NOT EXISTS idx_deal_cross_scores_lead ON deal_cross_module_scores(deal_lead_id);
CREATE INDEX IF NOT EXISTS idx_deal_cross_scores_target ON deal_cross_module_scores(target_module);

COMMENT ON TABLE deal_cross_module_scores IS
  'Điểm chéo: module nguồn chấm module đích trên deal (thang 1–5 sao).';

CREATE TABLE IF NOT EXISTS deal_customer_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  stars NUMERIC NOT NULL CHECK (stars >= 1 AND stars <= 5),
  feedback TEXT,
  source TEXT DEFAULT 'manual',
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_customer_ratings_lead ON deal_customer_ratings(deal_lead_id);

COMMENT ON TABLE deal_customer_ratings IS 'Đánh giá sao của khách hàng cho deal (có thể nhập thủ công hoặc khảo sát).';

INSERT INTO app_settings (key, value) VALUES
(
  'deal_performance_weights',
  '{"cross_internal_weight":0.45,"customer_weight":0.55}'::jsonb
),
(
  'deal_bonus_penalty_rules',
  '[
    {"min_avg_stars":4.5,"bonus_percent_of_deal_value":1,"label":"Xuất sắc"},
    {"min_avg_stars":4,"max_avg_stars":4.49,"bonus_percent_of_deal_value":0.5,"label":"Tốt"},
    {"min_avg_stars":3,"max_avg_stars":3.99,"bonus_percent_of_deal_value":0.25,"label":"Đạt"},
    {"max_avg_stars":2.99,"penalty_percent_of_deal_value":0.5,"label":"Cần cải thiện"}
  ]'::jsonb
)
ON CONFLICT (key) DO NOTHING;
