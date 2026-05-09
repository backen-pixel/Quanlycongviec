-- 148_crm_kpi_schema.sql
-- Schema KPI cho CRM Tủ Bếp: definitions, periods, targets, scores.
-- Seed 15 KPI definitions theo file Excel KPI_CRM_SalesAdmin_Deal_TuBep.xlsx
-- (đã chuẩn hoá theo plan: 6 KPI nhóm A + 5 KPI nhóm B + 4 KPI nhóm C, tổng weight = 100).
-- Idempotent.

BEGIN;

-- ═══ kpi_definitions ═════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS kpi_definitions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,                  -- 'A1','A2','B1'…
  name TEXT NOT NULL,
  description TEXT,
  group_code TEXT NOT NULL CHECK (group_code IN ('A','B','C')),
  formula_type TEXT NOT NULL CHECK (formula_type IN ('increasing','decreasing','quantity','revenue','duration')),
  unit TEXT,                                  -- '%','VND','minute','count','day'
  weight NUMERIC(6,2) NOT NULL DEFAULT 0,
  target_default NUMERIC,
  target_max NUMERIC,                         -- ngưỡng tối đa cho công thức (vd: B4 20-35%)
  min_threshold NUMERIC,                      -- KPI gating: dưới ngưỡng này thì cap tổng KPI
  is_gating BOOLEAN NOT NULL DEFAULT false,
  applies_to TEXT NOT NULL DEFAULT 'sales' CHECK (applies_to IN ('sales','sales_admin','deal','all')),
  data_source_note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE kpi_definitions IS 'Định nghĩa các KPI áp dụng cho CRM tủ bếp (15 KPI chuẩn).';
COMMENT ON COLUMN kpi_definitions.formula_type IS
  'increasing: cao càng tốt | decreasing: thấp càng tốt | quantity: theo target số lượng | revenue: theo target doanh số | duration: thời gian (giảm dần)';
COMMENT ON COLUMN kpi_definitions.is_gating IS
  'Nếu TRUE: actual < min_threshold sẽ giới hạn tổng KPI (vd: A4 < 80% → tổng <= 70 điểm)';

CREATE INDEX IF NOT EXISTS idx_kpi_definitions_active ON kpi_definitions (is_active, group_code);

-- ═══ kpi_periods ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS kpi_periods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly','quarterly','yearly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','closed')),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (period_type, period_start)
);

COMMENT ON TABLE kpi_periods IS 'Kỳ KPI (tháng/quý/năm). Khi locked: không cho recompute; closed: chốt số chính thức.';
CREATE INDEX IF NOT EXISTS idx_kpi_periods_range ON kpi_periods (period_start, period_end);

-- ═══ kpi_targets ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS kpi_targets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kpi_definition_id UUID NOT NULL REFERENCES kpi_definitions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,    -- NULL = target chung công ty
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly','quarterly','yearly')),
  period_start DATE NOT NULL,
  target_value NUMERIC NOT NULL,
  weight_override NUMERIC(6,2),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE kpi_targets IS 'Target cụ thể cho từng KPI theo nhân viên/kỳ; nếu không có thì dùng target_default trong kpi_definitions.';

-- UNIQUE phải dùng partial index vì user_id/company_id có thể NULL (target chung công ty)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_kpi_targets_user_period
  ON kpi_targets (kpi_definition_id, user_id, company_id, period_type, period_start)
  WHERE user_id IS NOT NULL AND company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_kpi_targets_user_only
  ON kpi_targets (kpi_definition_id, user_id, period_type, period_start)
  WHERE user_id IS NOT NULL AND company_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_kpi_targets_company_only
  ON kpi_targets (kpi_definition_id, company_id, period_type, period_start)
  WHERE user_id IS NULL AND company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_kpi_targets_default
  ON kpi_targets (kpi_definition_id, period_type, period_start)
  WHERE user_id IS NULL AND company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_kpi_targets_lookup
  ON kpi_targets (kpi_definition_id, period_start, user_id);

-- ═══ kpi_scores ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS kpi_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kpi_definition_id UUID NOT NULL REFERENCES kpi_definitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES kpi_periods(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  actual_value NUMERIC,
  target_value NUMERIC,
  weight_used NUMERIC(6,2),
  raw_score NUMERIC,                  -- điểm trước khi cap 1.2x weight
  capped_score NUMERIC,               -- min(raw_score, 1.2 * weight)
  breakdown JSONB,                    -- {numerator, denominator, sample_ids…}
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kpi_definition_id, user_id, period_id)
);

COMMENT ON TABLE kpi_scores IS 'Điểm KPI thực tế cho mỗi nhân viên/kỳ. Recompute lại sẽ UPSERT.';
CREATE INDEX IF NOT EXISTS idx_kpi_scores_user_period ON kpi_scores (user_id, period_id);
CREATE INDEX IF NOT EXISTS idx_kpi_scores_period ON kpi_scores (period_id);

-- ═══ Seed 15 KPI definitions ════════════════════════════════════════════════
-- Dùng INSERT … ON CONFLICT để chạy lại an toàn.

INSERT INTO kpi_definitions
  (code, name, description, group_code, formula_type, unit, weight, target_default, target_max, min_threshold, is_gating, applies_to, data_source_note)
VALUES
  -- ── Nhóm A: Tốc độ & kỷ luật ────────────────────────────────────────────
  ('A1', 'Tỷ lệ phản hồi lead đúng SLA 15 phút',
        '% lead được cham lần đầu trong 15 phút sau khi tạo (giờ hành chính); ngoài giờ tính sang đầu giờ hôm sau.',
        'A', 'increasing', '%', 12, 90, NULL, NULL, false, 'sales_admin',
        'crm_leads.created_at vs first_touch_time'),

  ('A2', 'Thời gian phản hồi lead trung bình',
        'Trung bình first_touch_time - created_at (phút) cho lead trong kỳ.',
        'A', 'duration', 'minute', 4, 15, NULL, NULL, false, 'sales_admin',
        'AVG(first_touch_time - created_at) trên crm_leads'),

  ('A3', 'Tỷ lệ lead đủ thông tin chuẩn',
        '% lead đủ 6 field bắt buộc: phone, customer, region, ngân sách, thời gian dự kiến, địa chỉ.',
        'A', 'increasing', '%', 7, 95, NULL, NULL, false, 'sales_admin',
        'COUNT(info_complete) / COUNT(*)'),

  ('A4', 'Tỷ lệ follow-up đúng lịch',
        '% task crm_tasks hoàn thành trước/đúng deadline. Là KPI gating: <80% giới hạn tổng KPI 70.',
        'A', 'increasing', '%', 7, 95, NULL, 80, true, 'sales',
        'crm_tasks.completed_at <= deadline'),

  ('A5', 'Tỷ lệ deal đúng SLA từng stage',
        '% deal không vượt sla_days của stage hiện tại tại bất kỳ stage nào trong kỳ.',
        'A', 'increasing', '%', 3, 90, NULL, NULL, false, 'deal',
        'crm_lead_stage_history.duration_seconds vs stages.sla_days'),

  ('A6', 'Số lead/deal vượt SLA',
        'Đếm số lead/deal đang treo quá SLA (chỉ số quản trị, càng thấp càng tốt).',
        'A', 'decreasing', 'count', 2, 5, NULL, NULL, false, 'all',
        'crm_leads.stage_entered_at + sla_days < NOW()'),

  -- ── Nhóm B: Chất lượng chuyển đổi (45 weight) ──────────────────────────
  ('B1', 'Tỷ lệ liên hệ thành công',
        '% lead có ít nhất 1 lần kết nối thành công (call thành công, zalo trả lời).',
        'B', 'increasing', '%', 7, 70, NULL, NULL, false, 'sales_admin',
        'crm_activities.outcome IS NOT NULL & type IN (call,zalo,meeting)'),

  ('B2', 'Tỷ lệ Lead → Khảo sát',
        '% lead chuyển từ pipeline lead sang stage khảo sát (survey_scheduled hoặc survey_done).',
        'B', 'increasing', '%', 8, 40, NULL, NULL, false, 'sales',
        'stage_history transition lead_*  → survey_*'),

  ('B3', 'Tỷ lệ Khảo sát → Báo giá',
        '% deal sau khảo sát đến được bước báo giá (designing/quoted).',
        'B', 'increasing', '%', 7, 85, NULL, NULL, false, 'deal',
        'transition survey_done|designing → quoted'),

  ('B4', 'Tỷ lệ Báo giá → Ký HD',
        '% deal đã báo giá chốt được hợp đồng. KPI lõi.',
        'B', 'increasing', '%', 18, 25, 35, NULL, false, 'deal',
        'transition quoted → contract_signed'),

  ('B5', 'Thời gian khảo sát → báo giá',
        'Số ngày trung bình từ stage survey_done đến quoted (mục tiêu 1-3 ngày).',
        'B', 'duration', 'day', 5, 3, NULL, NULL, false, 'deal',
        'AVG duration giữa 2 stage'),

  -- ── Nhóm C: Kết quả kinh doanh (20 weight) ─────────────────────────────
  ('C1', 'Doanh số ký mới',
        'Tổng giá trị hợp đồng ký trong kỳ (theo target tháng).',
        'C', 'revenue', 'VND', 15, 1000000000, NULL, NULL, false, 'deal',
        'SUM(estimated_value) WHERE entered contract_signed in period'),

  ('C2', 'Giá trị trung bình hợp đồng',
        'Giá trị TB mỗi hợp đồng đã ký trong kỳ.',
        'C', 'revenue', 'VND', 2, 200000000, NULL, NULL, false, 'deal',
        'AVG(estimated_value) HD ký'),

  ('C3', 'Sản lượng lead xử lý',
        'Tổng số lead được giao và xử lý trong kỳ.',
        'C', 'quantity', 'count', 2, 30, NULL, NULL, false, 'sales_admin',
        'COUNT(crm_leads) by lead_owner_id in period'),

  ('C4', 'Tỷ lệ lost (lead/deal)',
        '% lead/deal vào stage lost trong kỳ (chỉ số quản trị, càng thấp càng tốt).',
        'C', 'decreasing', '%', 1, 15, NULL, NULL, false, 'all',
        'history transitions to lost / total active')

ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  group_code = EXCLUDED.group_code,
  formula_type = EXCLUDED.formula_type,
  unit = EXCLUDED.unit,
  weight = EXCLUDED.weight,
  target_default = EXCLUDED.target_default,
  target_max = EXCLUDED.target_max,
  min_threshold = EXCLUDED.min_threshold,
  is_gating = EXCLUDED.is_gating,
  applies_to = EXCLUDED.applies_to,
  data_source_note = EXCLUDED.data_source_note,
  updated_at = NOW();

-- Sanity check: tổng weight của KPI active = 100
DO $$
DECLARE total_w NUMERIC;
BEGIN
  SELECT SUM(weight) INTO total_w FROM kpi_definitions WHERE is_active = true;
  IF total_w <> 100 THEN
    RAISE NOTICE '148: Tổng weight KPI active = % (kỳ vọng 100). Kiểm tra lại.', total_w;
  END IF;
END $$;

COMMIT;
