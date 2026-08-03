/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

async function run(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  console.log(res.status, text.slice(0, 1200));
  return res.ok;
}

(async () => {
  // Add columns without FK first (users PK quirks on some envs), then try FK.
  await run(`
ALTER TABLE production_handover_settings
  ADD COLUMN IF NOT EXISTS delivery_confirm_user_id UUID;
ALTER TABLE logistics_handover_settings
  ADD COLUMN IF NOT EXISTS handover_confirm_user_id UUID;
COMMENT ON COLUMN production_handover_settings.delivery_confirm_user_id IS
  'Quản lý giao hàng — người được bấm xác nhận phía Sản xuất trên thẻ bàn giao VC/LĐ';
COMMENT ON COLUMN logistics_handover_settings.handover_confirm_user_id IS
  'Người được bấm xác nhận phía VC/LĐ trên thẻ bàn giao';
`);

  await run(`
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
`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
