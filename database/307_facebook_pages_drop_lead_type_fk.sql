-- Facebook page default_lead_type_id is polymorphic:
--   module = crm        -> references crm_lead_types(id)
--   module = production  -> references workshop_project_types(id)
--   module = logistics   -> references workshop_project_types(id)
-- A single FK to crm_lead_types blocks saving a Sản xuất / Vận chuyển classification
-- (foreign key violation), so we drop it. Integrity is enforced at the app layer.
ALTER TABLE facebook_pages
  DROP CONSTRAINT IF EXISTS facebook_pages_default_lead_type_id_fkey;
