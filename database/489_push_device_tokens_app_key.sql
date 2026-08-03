-- Tách token push theo app (sx-mobile / vc-mobile / crm-mobile…)
-- để FCM không gửi thông báo Xưởng SX sang máy VC và ngược lại.

alter table public.push_device_tokens
  add column if not exists app_key text;

comment on column public.push_device_tokens.app_key is
  'Định danh app mobile (khớp mobile_apps.app_key): sx-mobile | vc-mobile | crm-mobile | crm-mobile-v2';

create index if not exists idx_push_device_tokens_user_app
  on public.push_device_tokens (user_id, app_key);

NOTIFY pgrst, 'reload schema';
