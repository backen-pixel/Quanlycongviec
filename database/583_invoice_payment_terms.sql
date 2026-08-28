-- Migration 583: align invoice API/UI contract with the staging schema.
-- Additive and idempotent; existing invoices remain unchanged.

begin;

alter table public.invoices
  add column if not exists payment_terms text;

comment on column public.invoices.payment_terms is
  'Điều khoản thanh toán hiển thị trên hóa đơn; tách biệt với trạng thái và lịch sử thu tiền.';

commit;
