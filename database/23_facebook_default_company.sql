-- Add default_company_id to facebook_pages for auto-assigning company to leads
ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS default_company_id uuid REFERENCES companies(id);
