-- 597 — Gom nhóm phía SQL cho trang «Tổng quan nhiệm vụ» (/management/project-tasks)
--
-- ĐÃ CHẠY TRÊN PRODUCTION (2026-09-11). File này để lưu vết; chạy lại vẫn an toàn.
--
-- ══ VÌ SAO ══
-- GET /api/work-tasks/project-overview đọc ~13.000 nhiệm vụ của mọi dự án đang hoạt động,
-- gom thành ~2.500 nhóm rồi CHỈ trả về số đếm + hạn sớm nhất của từng nhóm. Toàn bộ chi
-- tiết từng nhiệm vụ bị bỏ đi — nhưng vẫn phải kéo qua mạng.
--
-- Đo trên chính DB này:
--   • Một truy vấn view kèm danh sách id tường minh: 4,2 ms (Index Scan idx_crm_tasks_lead).
--     → DATABASE KHÔNG CHẬM. Chi phí nằm ở số lượt round-trip và khối lượng truyền.
--   • Đã thử một RPC CHỈ chọn phạm vi rồi vẫn gom nhóm ở JS: CHẬM HƠN đường cũ
--     (5,2s so với 4,0s) — 3MB JSON đi trong một luồng duy nhất không giấu được độ trễ
--     như ~20 truy vấn song song. Nên phải giảm KHỐI LƯỢNG, không chỉ giảm số lượt.
--   • Gom nhóm ngay trong SQL: ~600KB thay vì 3MB, và bỏ luôn được bước đọc chi tiết
--     nhiệm vụ (crm_tasks + tasks) vì hạng mục đã tính xong trong SQL.
--
-- ══ ĐỐI CHIẾU ══
-- Đã so từng nhóm với đường JS cũ: 2.470/2.470 nhóm trùng khớp trên cả 26 trường
-- (kể cả assignee_name, module_owner_*, effective_*, region_id, company_name) và trùng
-- cả khối `stats`. Bảng gấp dấu tiếng Việt đã đối chiếu 235 giá trị thật trong DB, 0 lệch.
--
-- Chưa chạy file này thì backend tự rơi về đường cũ — không đổi hành vi.

-- ── Hàm phụ ────────────────────────────────────────────────────────────────────
-- metadata có thể chứa chuỗi không phải uuid; ép thẳng sẽ làm hỏng CẢ câu truy vấn.
create or replace function public.wpo_try_uuid(v text) returns uuid
language sql immutable as $$
  select case when v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then v::uuid else null end;
$$;

-- Bản SQL của humanizeSlug() bên JS.
create or replace function public.wpo_humanize(v text) returns text
language sql immutable as $$
  select case when s = '' then '' else upper(left(s,1)) || substr(s,2) end
  from (select btrim(regexp_replace(regexp_replace(regexp_replace(
                 coalesce(v,''), '^vc_ws_', ''), '^sx_', ''), '[-_]+', ' ', 'g')) as s) x;
$$;

-- ── Hàm chính ──────────────────────────────────────────────────────────────────
create or replace function public.work_project_overview_groups(
  p_company_id uuid default null,   -- null = không khoá công ty (admin hệ thống)
  p_module     text default null,   -- 'crm' | 'sx' | 'vc' | null = tất cả
  p_user_id    uuid default null,   -- chỉ dùng khi p_manager = false
  p_manager    boolean default true
)
returns jsonb                        -- jsonb (không phải SETOF): kiểu vô hướng không
                                     -- dính trần max-rows 1.000 của PostgREST
language plpgsql stable security invoker set search_path = public
as $fn$
declare
  -- Gấp dấu tiếng Việt: lower() rồi translate(). Sinh từ Unicode NFD nên khớp foldVi() JS.
  c_from constant text := 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿāăąćĉċčďēĕėęěĝğġģĥĩīĭįĵķĺļľńņňōŏőŕŗřśŝşšţťũūŭůűųŵŷźżžơưǎǐǒǔǖǘǚǜǟǡǧǩǫǭǰǵǹǻȁȃȅȇȉȋȍȏȑȓȕȗșțȟȧȩȫȭȯȱȳḁḃḅḇḉḋḍḏḑḓḕḗḙḛḝḟḡḣḥḧḩḫḭḯḱḳḵḷḹḻḽḿṁṃṅṇṉṋṍṏṑṓṕṗṙṛṝṟṡṣṥṧṩṫṭṯṱṳṵṷṹṻṽṿẁẃẅẇẉẋẍẏẑẓẕẖẗẘẙạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđ';
  c_to   constant text := 'aaaaaaceeeeiiiinooooouuuuyyaaaccccdeeeeegggghiiiijklllnnnooorrrssssttuuuuuuwyzzzouaiouuuuuaagkoojgnaaaeeiioorruusthaeooooyabbbcdddddeeeeefghhhhhiikkkllllmmmnnnnoooopprrrrsssssttttuuuuuvvwwwwwxxyzzzhtwyaaaaaaaaaaaaeeeeeeeeiioooooooooooouuuuuuuyyyyd';
  v_active uuid[]; v_prod uuid[]; v_log uuid[]; v_leads uuid[];
  v_all boolean := p_module is null or p_module = '';
  v_out jsonb;
begin
  -- activeProjects
  select array_agg(p.id) into v_active from projects p
  where lower(coalesce(p.status::text,'')) not in ('completed','cancelled','canceled')
    and (p_company_id is null or p.company_id = p_company_id);
  if v_active is null then return '[]'::jsonb; end if;

  -- isProductionTaskTerminalStage()
  select array_agg(p.id) into v_prod from projects p
  where p.id = any(v_active) and (p.sx_kanban_column_id is null or p.sx_kanban_column_id not in (
    select s.id from production_pipeline_stages s
    where s.is_handover_to_logistics or s.counts_as_completed_revenue or s.counts_as_collected_revenue
       or lower(btrim(coalesce(s.bucket_slug,''))) in ('delivered','completed','done','collected')
       or btrim(lower(translate(coalesce(s.name,''), c_from, c_to))) like '%da giao hang%'
       or btrim(lower(translate(coalesce(s.name,''), c_from, c_to))) = 'da giao'
       or btrim(lower(translate(coalesce(s.name,''), c_from, c_to))) like 'hoan thanh%'
       or btrim(lower(translate(coalesce(s.name,''), c_from, c_to))) like 'da thu%'));

  -- isLogisticsCompletedColumn()
  select array_agg(p.id) into v_log from projects p
  where p.id = any(v_active) and (p.vc_kanban_column_id is null or p.vc_kanban_column_id not in (
    select s.id from logistics_pipeline_stages s
    where lower(btrim(coalesce(s.bucket_slug,''))) in ('completed','done','install_completed')
       or btrim(lower(translate(coalesce(s.name,''), c_from, c_to))) in ('hoan thanh','hoan thien')
       or btrim(lower(translate(coalesce(s.name,''), c_from, c_to))) like 'hoan thanh %'
       or btrim(lower(translate(coalesce(s.name,''), c_from, c_to))) like 'hoan thien %'));

  -- Lead còn mở (chưa thắng / mất / hoàn thành)
  select array_agg(l.id) into v_leads from crm_leads l
  left join crm_pipeline_stages cs on cs.id = l.stage_id
  where l.project_id = any(v_active)
    and coalesce(cs.is_won,false) = false and coalesce(cs.is_lost,false) = false
    and not (coalesce(cs.counts_as_completed_revenue,false)
      or lower(btrim(coalesce(cs.canonical_slug,''))) in ('completed','done')
      or btrim(lower(translate(coalesce(cs.name,''), c_from, c_to))) = 'hoan thanh'
      or btrim(lower(translate(coalesce(cs.name,''), c_from, c_to))) like 'hoan thanh %');

  with base as (
    select u.* from unified_tasks_v u
    where v_leads is not null and (v_all or p_module='crm')
      and u.source='crm_task' and u.lead_id = any(v_leads)
    union all
    select u.* from unified_tasks_v u
    where v_prod is not null and (v_all or p_module='sx')
      and u.source='task' and u.is_primary_lead and u.project_id = any(v_prod)
      and u.task_kind in ('SX','Dự án')
    union all
    select u.* from unified_tasks_v u
    where v_log is not null and (v_all or p_module='vc')
      and u.source='task' and u.is_primary_lead and u.project_id = any(v_log)
      and u.task_kind = 'VC'
  ),
  loc as (select * from base b
    where (p_company_id is null or b.company_id = p_company_id)
      and (p_manager or p_user_id is null or b.assignee_id = p_user_id or b.created_by_id = p_user_id)),
  -- Giữ đúng một dòng cho mỗi unified_id, giống bước merge bằng Map bên JS.
  uniq as (select distinct on (unified_id) * from loc order by unified_id),
  det as (
    select t.unified_id, t.source, t.source_id, t.project_id, t.lead_id, t.company_id,
      t.task_kind, t.project_code, t.project_name, t.lead_title, t.deadline, t.assignee_id,
      -- taskOwnerLane()
      case when t.task_kind in ('SX','Dự án') then 'production'
           when t.task_kind = 'VC' then 'logistics'
           when t.task_kind in ('CRM-Deal','CRM-Lead','Giao việc') then 'sales'
           when t.source in ('crm_task','crm_assignment') then 'sales'
           else 'production' end as lane,
      coalesce(t.project_id::text, t.lead_id::text, 'none') as owner_key,
      lower(coalesce(t.status,'')) in ('done','completed','cancelled','canceled') as is_done,
      -- projectOverviewCategoryId(); nullif() vì JS dùng `||` nên chuỗi rỗng cũng rơi tiếp
      case when t.source='crm_task'
        then coalesce(nullif(ct.pipeline_stage_id::text,''), nullif(ct.production_pipeline_stage_id::text,''), nullif(ct.stage_slug,''), 'crm-general')
        else coalesce(nullif(tk.metadata->>'workshop_template_id',''), nullif(tk.production_stage_id::text,''),
                      nullif(tk.metadata->>'logistics_pipeline_stage_id',''), nullif(tk.metadata->>'guessed_stage_slug',''),
                      nullif(tk.stage_id::text,''), 'project-general') end as category_id,
      -- categoryFor().title
      case when t.source='crm_task'
        then coalesce(nullif(cps.name,''), nullif(pps_c.name,''), nullif(public.wpo_humanize(ct.stage_slug),''), 'Nhiệm vụ CRM')
        else coalesce(nullif(wtt.name,''), nullif(pps_t.name,''), nullif(lps.name,''),
                      nullif(public.wpo_humanize(tk.metadata->>'guessed_stage_slug'),''), 'Nhiệm vụ dự án') end as category_title,
      -- categoryFor().order — JS dùng `??` nên order_index = 0 vẫn được giữ
      case when t.source='crm_task' then coalesce(cps.order_index, pps_c.order_index, 999)
           else coalesce(wtt.order_index, pps_t.order_index, lps.order_index, 999) end as category_order
    from uniq t
    left join crm_tasks ct on t.source='crm_task' and ct.id = public.wpo_try_uuid(t.source_id)
    left join tasks tk on t.source='task' and tk.id = public.wpo_try_uuid(t.source_id)
    left join crm_pipeline_stages cps on cps.id = ct.pipeline_stage_id
    left join production_pipeline_stages pps_c on pps_c.id = ct.production_pipeline_stage_id
    left join workshop_task_templates wtt on wtt.id = public.wpo_try_uuid(tk.metadata->>'workshop_template_id')
    left join production_pipeline_stages pps_t on pps_t.id = tk.production_stage_id
    left join logistics_pipeline_stages lps on lps.id = public.wpo_try_uuid(tk.metadata->>'logistics_pipeline_stage_id')
  ),
  grp as (
    select lane, owner_key, category_id,
      -- Hạng mục lấy từ nhiệm vụ ĐẦU TIÊN của nhóm: bên JS nhóm chỉ được tạo một lần,
      -- ở lần gặp đầu, và thứ tự trong nhóm chính là unified_id tăng dần.
      (array_agg(category_title order by unified_id))[1] as category_title,
      (array_agg(category_order order by unified_id))[1] as category_order,
      count(*) as child_total,
      count(*) filter (where is_done) as child_completed,
      count(*) filter (where not is_done) as open_total,
      min(deadline) filter (where not is_done and deadline is not null) as deadline,
      (array_agg(assignee_id order by unified_id) filter (where not is_done and assignee_id is not null))[1] as assignee_id,
      -- `first` bên JS: nhiệm vụ mở đầu tiên, không có thì lấy nhiệm vụ đầu tiên.
      coalesce(
        (array_agg(jsonb_build_object('source',source,'source_id',source_id,'project_id',project_id,
           'lead_id',lead_id,'company_id',company_id,'task_kind',task_kind,'project_code',project_code,
           'project_name',project_name,'lead_title',lead_title) order by unified_id) filter (where not is_done))[1],
        (array_agg(jsonb_build_object('source',source,'source_id',source_id,'project_id',project_id,
           'lead_id',lead_id,'company_id',company_id,'task_kind',task_kind,'project_code',project_code,
           'project_name',project_name,'lead_title',lead_title) order by unified_id))[1]) as rep
    from det group by lane, owner_key, category_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'unified_id', 'group:' || lane || ':' || owner_key || ':' || category_id,
    'source', rep->>'source', 'source_id', rep->>'source_id',
    'project_id', rep->'project_id', 'lead_id', rep->'lead_id',
    'company_id', rep->'company_id', 'task_kind', rep->>'task_kind',
    'title', category_title, 'category_id', category_id,
    'owner_lane', lane, 'category_order', category_order,
    'project_code', rep->>'project_code', 'project_name', rep->>'project_name',
    'lead_title', rep->>'lead_title', 'deadline', deadline,
    'child_completed', child_completed, 'child_total', child_total,
    'assignee_id', assignee_id)), '[]'::jsonb) into v_out
  from grp where open_total > 0;   -- nhóm đã xong hết thì bỏ, giống JS

  return v_out;
end; $fn$;

comment on function public.work_project_overview_groups(uuid, text, uuid, boolean) is
  'Tổng quan nhiệm vụ: chọn phạm vi + gom nhóm ngay trong SQL. Trả jsonb để không dính trần max-rows 1.000.';

grant execute on function public.wpo_try_uuid(text) to authenticated, service_role;
grant execute on function public.wpo_humanize(text) to authenticated, service_role;
grant execute on function public.work_project_overview_groups(uuid, text, uuid, boolean) to authenticated, service_role;
