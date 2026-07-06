-- 396_ai_bot_time_scope_day_cycle.sql
-- Thêm time_scope day_cycle: 8h sáng = hôm qua · 20h tối = hôm nay (tab NV / BC tổ chức).

DO $$
DECLARE
  c_name TEXT;
BEGIN
  FOR c_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'ai_chat_bot_schedules'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%time_scope%'
  LOOP
    EXECUTE format('ALTER TABLE ai_chat_bot_schedules DROP CONSTRAINT %I', c_name);
  END LOOP;
END $$;

ALTER TABLE ai_chat_bot_schedules
  ADD CONSTRAINT ai_chat_bot_schedules_time_scope_check
  CHECK (time_scope IN (
    'today', 'yesterday', 'last_7d', 'last_30d',
    'this_month', 'last_month', 'custom', 'day_cycle'
  ));

COMMENT ON COLUMN ai_chat_bot_schedules.time_scope IS
  'Kỳ BC: today | yesterday | last_7d | last_30d | this_month | last_month | custom | day_cycle (sáng=hôm qua, tối≥17h=hôm nay)';
