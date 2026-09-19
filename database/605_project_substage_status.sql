-- 605: Trang thai tung VIEC SONG SONG cua mot du an trong mot cot lon (Kanban cot long).
-- DA CHAY TREN PRODUCTION 2026-09-12 theo yeu cau anh B.A. Backfill: 492 dong trang thai "dang".
--
-- VAN DE: truoc migration nay he thong chi co projects.sx_kanban_column_id — moi du an
-- nam o DUNG MOT cot nho. Khong co cho nao ghi duoc «thung xong, nhom dang lam», nen
-- ma tran viec song song tren dashboard chi to duoc dung mot o moi hang.
--
-- BANG NAY LA PHU (additive): khong sua, khong xoa bat ky bang/cot nao dang co.
-- Khong co dong nao thi giao dien chay y het truoc — mac dinh la 'chua'.
-- sx_kanban_column_id VAN LA NGUON DUY NHAT xac dinh du an thuoc cot lon nao;
-- bang nay chi bo sung trang thai cua tung viec song song ben trong cot lon do.

create table if not exists project_substage_status (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid,
  project_id  uuid not null references projects(id) on delete cascade,
  stage_id    uuid not null references production_pipeline_stages(id) on delete cascade,
  trang_thai  text not null default 'chua',
  nguoi_lam   uuid references users(id) on delete set null,
  bat_dau_luc timestamptz,
  xong_luc    timestamptz,
  ghi_chu     text,
  updated_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint project_substage_status_trang_thai_chk
    check (trang_thai in ('chua', 'dang', 'xong')),
  constraint project_substage_status_uniq unique (project_id, stage_id)
);

comment on table project_substage_status is
  'Trang thai tung viec song song (cot nho) cua mot du an. chua/dang/xong. Bo sung cho sx_kanban_column_id, khong thay the.';
comment on column project_substage_status.trang_thai is 'chua = chua toi luot, dang = dang lam, xong = da xong';

-- Doc theo cot (ma tran mo mot cot lon -> lay het o cua cac cot nho trong do).
create index if not exists idx_pss_stage on project_substage_status (stage_id);
-- Doc theo cong ty khi mo board.
create index if not exists idx_pss_company_stage on project_substage_status (company_id, stage_id);

-- RLS: giong het production_pipeline_stages (backend dung service key).
alter table project_substage_status enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'project_substage_status' and policyname = 'service_all'
  ) then
    create policy service_all on project_substage_status for all using (true);
  end if;
end $$;

-- Backfill AN TOAN: du an dang dung o cot nho nao thi danh dau cot do 'dang'.
-- Chi dong nay la su that duy nhat he thong dang biet — KHONG suy doan cot truoc la 'xong'
-- (viec song song von khong cho nhau, suy doan se hien sai).
insert into project_substage_status (company_id, project_id, stage_id, trang_thai, bat_dau_luc)
select p.company_id, p.id, s.id, 'dang', p.sx_pipeline_stage_entered_at
from projects p
join production_pipeline_stages s on s.id = p.sx_kanban_column_id
where p.sx_kanban_column_id is not null
  and s.group_key is not null
on conflict (project_id, stage_id) do nothing;
