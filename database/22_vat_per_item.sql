-- Migration: Add per-item VAT columns to quotation_items, order_items, invoice_items
-- Each item now tracks its own vat_rate and vat_amount

ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 0;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS vat_amount NUMERIC DEFAULT 0;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS vat_amount NUMERIC DEFAULT 0;

ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS vat_amount NUMERIC DEFAULT 0;
