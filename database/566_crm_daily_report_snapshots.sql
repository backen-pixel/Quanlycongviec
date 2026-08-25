-- Snapshot số AUTO báo cáo ngày (Phần I 08:00 / Phần II 16:45).
-- Matrix + Excel admin đọc bảng này, không tính live lúc xem.

CREATE TABLE IF NOT EXISTS public.crm_daily_report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL,
  company_id uuid NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  phase text NOT NULL CHECK (phase IN ('plan', 'result')),
  metric_key text NOT NULL,
  value numeric NULL,
  entity_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text NULL,
  source text NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_date, user_id, phase, metric_key)
);

CREATE INDEX IF NOT EXISTS crm_daily_report_snapshots_company_date
  ON public.crm_daily_report_snapshots (company_id, report_date, phase);

ALTER TABLE public.crm_daily_report_snapshots ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.crm_daily_report_snapshots TO postgres, service_role;
