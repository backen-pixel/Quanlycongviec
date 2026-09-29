-- Local candidate, 2026-09-29. Apply before the matching backend integration.
-- Scope: the VPT Messenger trial Page, CRM Lead only. No historical backfill.
-- Insert and contact link share one transaction and a contact row lock.
-- All creation/reuse callers in this scope MUST use this RPC; a unique index
-- cannot protect legacy writers that omit facebook_contact_id.
BEGIN;

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS facebook_contact_id UUID
  REFERENCES public.facebook_contacts(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_leads_facebook_contact_id_uidx
  ON public.crm_leads (facebook_contact_id)
  WHERE facebook_contact_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_facebook_contact_lead_once(
  p_contact_id UUID,
  p_page_id TEXT,
  p_company_id UUID,
  p_lead_data JSONB,
  p_existing_lead_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_contact public.facebook_contacts%ROWTYPE;
  v_page public.facebook_pages%ROWTYPE;
  v_lead public.crm_leads%ROWTYPE;
  v_payload JSONB;
  v_columns TEXT;
  v_values TEXT;
  v_created BOOLEAN := false;
  v_allowed CONSTANT TEXT[] := ARRAY[
    'code', 'title', 'type', 'customer_id', 'source_id', 'stage_id',
    'pipeline_id', 'company_id', 'region_id', 'lead_type_id',
    'install_address', 'description', 'lead_owner_id', 'assigned_to',
    'created_by', 'stage_entered_at'
  ];
BEGIN
  IF p_contact_id IS NULL
    OR p_page_id IS DISTINCT FROM '409741855550833'
    OR p_company_id IS DISTINCT FROM '991dc79d-cbf5-49f9-a364-35227cb47635'::UUID THEN
    RAISE EXCEPTION 'Facebook atomic lead: unsupported scope' USING ERRCODE = '22023';
  END IF;
  IF p_lead_data IS NULL OR jsonb_typeof(p_lead_data) <> 'object' THEN
    RAISE EXCEPTION 'Facebook atomic lead: object payload required' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_lead_data) AS k(key)
             WHERE NOT k.key = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Facebook atomic lead: unsupported payload field' USING ERRCODE = '22023';
  END IF;
  IF p_lead_data->>'type' IS DISTINCT FROM 'lead'
    OR p_lead_data->>'company_id' IS DISTINCT FROM p_company_id::TEXT THEN
    RAISE EXCEPTION 'Facebook atomic lead: payload scope mismatch' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_contact FROM public.facebook_contacts
    WHERE id = p_contact_id FOR UPDATE;
  IF NOT FOUND OR v_contact.page_id IS DISTINCT FROM p_page_id THEN
    RAISE EXCEPTION 'Facebook atomic lead: contact/page mismatch' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_page FROM public.facebook_pages
    WHERE page_id = p_page_id FOR SHARE;
  IF NOT FOUND
    OR v_page.is_active IS DISTINCT FROM true
    OR v_page.default_company_id IS DISTINCT FROM p_company_id
    OR COALESCE(NULLIF(lower(btrim(v_page.default_module_key)), ''), 'crm') <> 'crm'
    OR COALESCE(NULLIF(lower(btrim(v_page.default_target_type)), ''), 'lead') <> 'lead' THEN
    RAISE EXCEPTION 'Facebook atomic lead: Page configuration mismatch' USING ERRCODE = '22023';
  END IF;

  -- Prefer the committed contact link, even when a concurrent caller proposed
  -- a different customer or lead. Keep a row lock until the contact is linked.
  IF v_contact.lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM public.crm_leads
      WHERE id = v_contact.lead_id FOR UPDATE;
    IF FOUND AND (v_lead.company_id IS DISTINCT FROM p_company_id OR v_lead.type IS DISTINCT FROM 'lead') THEN
      RAISE EXCEPTION 'Facebook atomic lead: existing link scope mismatch' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Recover an insert whose contact link was later cleared. The RPC itself
  -- never commits an insert without a link.
  IF v_lead.id IS NULL THEN
    SELECT * INTO v_lead FROM public.crm_leads
      WHERE facebook_contact_id = p_contact_id FOR UPDATE;
    IF FOUND AND (v_lead.company_id IS DISTINCT FROM p_company_id OR v_lead.type IS DISTINCT FROM 'lead') THEN
      RAISE EXCEPTION 'Facebook atomic lead: stored lead scope mismatch' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Existing customer/phone matching remains a business-rule decision in the
  -- backend. Attaching its candidate uses the same lock as creating a lead.
  IF v_lead.id IS NULL AND p_existing_lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM public.crm_leads
      WHERE id = p_existing_lead_id FOR UPDATE;
    IF NOT FOUND OR v_lead.company_id IS DISTINCT FROM p_company_id OR v_lead.type IS DISTINCT FROM 'lead' THEN
      RAISE EXCEPTION 'Facebook atomic lead: candidate lead scope mismatch' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_lead.id IS NULL THEN
    IF NULLIF(btrim(p_lead_data->>'code'), '') IS NULL
      OR NULLIF(btrim(p_lead_data->>'title'), '') IS NULL THEN
      RAISE EXCEPTION 'Facebook atomic lead: code and title required' USING ERRCODE = '22023';
    END IF;
    v_payload := p_lead_data || jsonb_build_object('facebook_contact_id', p_contact_id);
    -- Whitelisted identifier names only; parameter binding for every value.
    -- Insert only supplied fields so omitted columns retain their DB defaults.
    SELECT string_agg(format('%I', key), ', ' ORDER BY key),
           string_agg(format('r.%I', key), ', ' ORDER BY key)
      INTO v_columns, v_values FROM jsonb_object_keys(v_payload) AS k(key);
    EXECUTE format(
      'INSERT INTO public.crm_leads (%s) SELECT %s FROM jsonb_populate_record(NULL::public.crm_leads, $1) AS r RETURNING *',
      v_columns, v_values
    ) INTO v_lead USING v_payload;
    v_created := true;
  END IF;

  UPDATE public.facebook_contacts
    SET lead_id = v_lead.id,
        customer_id = COALESCE(v_lead.customer_id, customer_id),
        updated_at = now()
    WHERE id = p_contact_id;

  RETURN jsonb_build_object('lead', to_jsonb(v_lead), 'created', v_created);
END;
$$;

REVOKE ALL ON FUNCTION public.create_facebook_contact_lead_once(UUID, TEXT, UUID, JSONB, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_facebook_contact_lead_once(UUID, TEXT, UUID, JSONB, UUID)
  TO service_role;

COMMENT ON FUNCTION public.create_facebook_contact_lead_once(UUID, TEXT, UUID, JSONB, UUID)
  IS 'VPT Messenger CRM Lead: atomic insert/link, contact row lock, created flag; service-role only';

COMMIT;

-- Rollback: first revert backend callers (while ingestion is paused). Retaining
-- the nullable column/index is safe and preserves retry identity. If complete
-- removal is approved, drop the function, then index, then column. Do not
-- delete leads or contacts; do not backfill from customer/phone guesses.
