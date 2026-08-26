-- 575: A quotation may be the source of at most one order.
-- The partial index preserves manually created orders that have no quotation.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_source_quotation
  ON orders (quotation_id)
  WHERE quotation_id IS NOT NULL;

COMMIT;
