-- 584: Xoa index trung tren facebook_contacts (bang nong, moi tin nhan den deu UPDATE bang nay).
-- Da chay tren Supabase (kdxypztstbeovyedmvem) ngay 04/09/2026.
--
--   idx_fb_contacts_psid               (page_id, psid)  -- non-unique  <- XOA
--   facebook_contacts_page_id_psid_key (page_id, psid)  -- UNIQUE      <- GIU
--
-- Hai index cung cot, cung thu tu. Ban UNIQUE phuc vu duoc moi truy van ma ban non-unique
-- phuc vu (tra cuu theo page_id, hoac page_id + psid), nen giu 2 ban chi ton them chi phi
-- ghi tren mot bang bi UPDATE lien tuc.

DROP INDEX CONCURRENTLY IF EXISTS public.idx_fb_contacts_psid;

-- Ghi chu: DA CAN NHAC ROI KHONG THEM index (page_id, last_message_at DESC) cho danh sach
-- hop thu. Do EXPLAIN ANALYZE cho thay cau nen chi mat 6ms (bitmap scan 4.650 dong + top-N
-- heapsort lay 400). 94ms trung binh cua endpoint /api/facebook/contacts den tu 3 tang join
-- long (lead -> source -> category) va select *, khong phai tu thieu index. Them index tren
-- last_message_at chi doi lay ~3ms doc nhung phai tra phi ghi moi tin nhan → khong dang.
