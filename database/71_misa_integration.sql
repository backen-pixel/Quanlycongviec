-- Migration: MISA meInvoice Integration
-- Adds MISA e-invoice tracking columns to invoices table
-- and a misa_config table for storing API credentials

-- ─────────────────────────────────────────────────────
-- 1. Thêm cột MISA vào bảng invoices
-- ─────────────────────────────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS misa_ref_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS misa_inv_series TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS misa_invoice_no TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS misa_status TEXT DEFAULT 'not_sent';
  -- not_sent | published | sent_email | cancelled
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS misa_published_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS misa_lookup_code TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS misa_error_message TEXT;

-- ─────────────────────────────────────────────────────
-- 2. Bảng cấu hình MISA meInvoice
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS misa_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id TEXT NOT NULL,                   -- AppID do MISA cung cấp khi đăng ký tích hợp
  taxcode TEXT NOT NULL,                  -- MST công ty đăng ký dịch vụ HĐĐT
  username TEXT NOT NULL,                 -- Tài khoản meInvoice
  password_encrypted TEXT NOT NULL,       -- Mật khẩu (lưu plain hoặc mã hóa tùy setup)
  inv_series TEXT NOT NULL DEFAULT '1C26TYY',  -- Ký hiệu hóa đơn năm 2026
  sign_type INT NOT NULL DEFAULT 2,       -- 1: USB, 2: HSM có CKS, 3: HSM bất đồng bộ
  is_production BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────
-- 3. Index để tra cứu nhanh theo misa_status
-- ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_misa_status ON invoices(misa_status);
CREATE INDEX IF NOT EXISTS idx_invoices_misa_invoice_no ON invoices(misa_invoice_no);
