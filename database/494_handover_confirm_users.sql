-- 494: Người bấm xác nhận bàn giao VC/LĐ (riêng với phụ trách chính dự án)
-- SX: Quản lý giao hàng · VC/LĐ: người xác nhận bàn giao

BEGIN;

ALTER TABLE production_handover_settings
  ADD COLUMN IF NOT EXISTS delivery_confirm_user_id UUID;

ALTER TABLE logistics_handover_settings
  ADD COLUMN IF NOT EXISTS handover_confirm_user_id UUID;

COMMENT ON COLUMN production_handover_settings.delivery_confirm_user_id IS
  'Quản lý giao hàng — người được bấm xác nhận phía Sản xuất trên thẻ bàn giao VC/LĐ';

COMMENT ON COLUMN logistics_handover_settings.handover_confirm_user_id IS
  'Người được bấm xác nhận phía VC/LĐ trên thẻ bàn giao (có thể khác phụ trách VC / lắp đặt)';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_handover_settings_delivery_confirm_user_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE production_handover_settings
        ADD CONSTRAINT production_handover_settings_delivery_confirm_user_id_fkey
        FOREIGN KEY (delivery_confirm_user_id) REFERENCES users(id) ON DELETE SET NULL;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'skip SX FK: %', SQLERRM;
    END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'logistics_handover_settings_handover_confirm_user_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE logistics_handover_settings
        ADD CONSTRAINT logistics_handover_settings_handover_confirm_user_id_fkey
        FOREIGN KEY (handover_confirm_user_id) REFERENCES users(id) ON DELETE SET NULL;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'skip VC FK: %', SQLERRM;
    END;
  END IF;
END $$;

COMMIT;
