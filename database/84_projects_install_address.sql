-- Migration 84: Thêm install_address vào projects (địa chỉ lắp đặt cho module VC)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS install_address TEXT;

COMMENT ON COLUMN projects.install_address IS
  'Địa chỉ lắp đặt thực tế (dùng cho module Vận chuyển & Lắp đặt)';
