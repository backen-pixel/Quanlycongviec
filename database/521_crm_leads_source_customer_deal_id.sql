-- Deal phát sinh từ deal khách hàng: liên kết nguồn nhưng vẫn hiện trên Kanban
-- (không dùng parent_lead_id — cột đó ẩn deal fulfillment khỏi pipeline).

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS source_customer_deal_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crm_leads_source_customer_deal_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE public.crm_leads
        ADD CONSTRAINT crm_leads_source_customer_deal_id_fkey
        FOREIGN KEY (source_customer_deal_id)
        REFERENCES public.crm_leads(id)
        ON DELETE SET NULL;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skip FK source_customer_deal_id: %', SQLERRM;
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_leads_source_customer_deal_id
  ON public.crm_leads (source_customer_deal_id)
  WHERE source_customer_deal_id IS NOT NULL;

COMMENT ON COLUMN public.crm_leads.source_customer_deal_id IS
  'Deal khách hàng nguồn khi tạo đơn hàng phát sinh (deal độc lập trên Kanban tab Khách hàng).';
