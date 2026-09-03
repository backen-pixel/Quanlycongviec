-- 577: Link xem ảnh công khai (không JWT). Ai có token vào được; không chứa PII khách hàng.
-- Backend (service role) ghi/đọc. RLS bật, không policy → anon/authenticated không đọc được bảng.

BEGIN;

CREATE TABLE IF NOT EXISTS public.public_share_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text NOT NULL,
  kind        text NOT NULL DEFAULT 'comment_images',
  title       text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  company_id  uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at  timestamptz,
  view_count  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_share_links_token_len CHECK (char_length(token) BETWEEN 16 AND 64),
  CONSTRAINT public_share_links_kind_chk CHECK (kind IN ('comment_images'))
);

CREATE UNIQUE INDEX IF NOT EXISTS public_share_links_token_uidx
  ON public.public_share_links (token);

CREATE INDEX IF NOT EXISTS public_share_links_company_created_idx
  ON public.public_share_links (company_id, created_at DESC);

ALTER TABLE public.public_share_links ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.public_share_links IS
  'Link xem ảnh (bình luận) không cần đăng nhập. Payload chỉ URL ảnh, không PII.';

CREATE OR REPLACE FUNCTION public.increment_public_share_view(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.public_share_links
  SET view_count = view_count + 1
  WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.increment_public_share_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_public_share_view(uuid) TO service_role;

COMMIT;
