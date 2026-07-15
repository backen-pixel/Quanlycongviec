/**
 * Seed bộ nhiệm vụ VC/LĐ theo từng cột pipeline cho mọi công ty có logistics_pipeline_stages.
 * Idempotent: bỏ qua nếu đã có template active gắn logistics_stage_id.
 *
 * Usage: node scripts/seed-vc-ld-stage-templates.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

async function runQuery(ref, query, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] ${res.status}: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isInstallStage(stage) {
  const name = String(stage.name || '').toLowerCase();
  const slug = String(stage.bucket_slug || '').toLowerCase();
  const sync = String(stage.crm_sync_type || '').toLowerCase();
  return (
    sync === 'installation'
    || slug.includes('install')
    || name.includes('lắp')
    || name.includes('lap dat')
  );
}

function esc(s) {
  return String(s ?? '').replace(/'/g, "''");
}

function checklistJson(items) {
  return JSON.stringify(items.map((text) => ({ text }))).replace(/'/g, "''");
}

/** Trả về danh sách item mẫu theo loại cột. */
function itemsForStage(stage) {
  const name = String(stage.name || '').toLowerCase();
  const slug = String(stage.bucket_slug || '').toLowerCase();
  const install = isInstallStage(stage);

  if (slug === 'delivery_pending' || name.includes('chờ xác nhận') || name.includes('chờ vận chuyển')) {
    return [
      { title: 'Tiếp nhận bàn giao từ SX', days: 0, block: true, checks: ['Đối chiếu mã dự án / packing list', 'Kiểm đếm kiện hàng', 'Xác nhận đủ hồ sơ lắp đặt'] },
      { title: 'Xác nhận lịch giao với khách', days: 0, block: false, checks: ['Gọi / nhắn khách xác nhận ngày giờ', 'Ghi địa chỉ + SĐT người nhận', 'Ghi chú điều kiện công trình'] },
      { title: 'Chuẩn bị xe & nhân sự VC', days: 1, block: true, checks: ['Chốt tài xế / phụ xe', 'Chọn xe phù hợp số kiện', 'Briefing packing list'] },
    ];
  }
  if (name.includes('xác nhận') && !install) {
    return [
      { title: 'Xác nhận đơn sẵn sàng giao', days: 0, block: true, checks: ['Kiểm tra đủ kiện', 'Xác nhận địa chỉ giao', 'Chốt khung giờ với khách'] },
      { title: 'Phân công chuyến giao', days: 0, block: false, checks: ['Gán tài xế', 'Gán tuyến / ETA', 'In / gửi packing list'] },
    ];
  }
  if (name.includes('đang vận chuyển') || (slug.includes('deliver') && !install && !name.includes('chờ'))) {
    return [
      { title: 'Kiểm tra trước khi lấy hàng', days: 0, block: false, checks: ['Đối chiếu mã dự án', 'Kiểm tra số kiện và phụ kiện', 'Chụp ảnh tổng kiện'] },
      { title: 'Hàng lên xe và vận chuyển', days: 1, block: false, checks: ['Xếp hàng an toàn', 'Chụp ảnh hàng trên xe', 'Xuất phát và theo dõi hành trình'] },
      { title: 'Cập nhật trạng thái trên đường', days: 1, block: true, checks: ['Gửi ETA cho khách', 'Ghi nhận sự cố (nếu có)', 'Xác nhận đã đến gần công trình'] },
    ];
  }
  if (name.includes('giao hàng') && !install) {
    return [
      { title: 'Kiểm tra trước khi giao', days: 0, block: true, checks: ['Kiểm tra kiện khi đến công trình', 'Đối chiếu packing list', 'Ghi nhận hư hỏng / thiếu (nếu có)'] },
      { title: 'Bàn giao hàng cho bên lắp', days: 0, block: false, checks: ['Bàn giao đủ kiện', 'Ký biên bản giao nhận', 'Chụp ảnh bàn giao'] },
    ];
  }
  if (name.includes('có vấn đề') || name.includes('có lỗi') || slug.includes('issue')) {
    return [
      { title: 'Ghi nhận sự cố', days: 0, block: true, checks: ['Mô tả sự cố rõ ràng', 'Chụp ảnh / video minh chứng', 'Phân loại: hư hỏng / thiếu / chậm'] },
      { title: 'Xử lý & báo cáo', days: 1, block: false, checks: ['Liên hệ khách / nội bộ', 'Đề xuất phương án xử lý', 'Cập nhật tiến độ xử lý'] },
    ];
  }
  if (name.includes('nhận hàng')) {
    return [
      { title: 'Kiểm tra và nhận hàng tại công trình', days: 0, block: true, checks: ['Kiểm đếm kiện / phụ kiện', 'Kiểm tra mặt bằng trước lắp', 'Xác nhận đủ hàng để lắp'] },
      { title: 'Chuẩn bị dụng cụ & mặt bằng', days: 0, block: false, checks: ['Chuẩn bị dụng cụ lắp', 'Bảo vệ sàn / tường', 'Phân khu vực thi công'] },
    ];
  }
  if (name.includes('đang lắp') || (install && name.includes('lắp') && !name.includes('nghiệm') && !name.includes('hoàn'))) {
    return [
      { title: 'Quy trình lắp đặt', days: 2, block: false, checks: ['Lắp theo bản vẽ hiện trường', 'Ghi nhận phát sinh (nếu có)', 'Vệ sinh khu vực thi công'] },
      { title: 'Kiểm tra chất lượng lắp', days: 1, block: true, checks: ['Kiểm tra độ thẳng / khe hở', 'Kiểm tra bản lề / ray', 'Chụp ảnh trước nghiệm thu'] },
    ];
  }
  if (name.includes('nghiệm thu')) {
    return [
      { title: 'Nghiệm thu với khách', days: 0, block: true, checks: ['Khách kiểm tra và ký nghiệm thu', 'Ghi hạng mục tồn / hẹn xử lý', 'Chụp ảnh công trình hoàn thiện'] },
      { title: 'Bàn giao hồ sơ', days: 0, block: false, checks: ['Giao biên bản nghiệm thu', 'Hướng dẫn sử dụng / bảo hành', 'Cập nhật trạng thái CRM nếu cần'] },
    ];
  }
  if (name.includes('hoàn thành') || slug.includes('completed') || name.includes('bàn giao')) {
    return [
      { title: 'Đóng hồ sơ công trình', days: 0, block: false, checks: ['Đủ biên bản giao / nghiệm thu', 'Lưu ảnh hoàn thiện', 'Xác nhận không còn hạng mục treo'] },
      { title: 'Chăm sóc sau bàn giao', days: 1, block: false, checks: ['Gọi hỏi thăm khách (nếu quy trình yêu cầu)', 'Ghi nhận phản hồi', 'Đóng ticket nội bộ'] },
    ];
  }
  if (name.includes('bảo hành') || name.includes('cskh') || slug.includes('customer')) {
    return [
      { title: 'Tiếp nhận yêu cầu CSKH', days: 0, block: false, checks: ['Ghi nội dung yêu cầu', 'Phân loại bảo hành / phát sinh', 'Hẹn lịch xử lý'] },
      { title: 'Xử lý và đóng yêu cầu', days: 2, block: true, checks: ['Thực hiện sửa / bảo hành', 'Khách xác nhận hoàn tất', 'Lưu biên bản'] },
    ];
  }

  // Fallback chung
  return [
    { title: `Thực hiện công việc — ${stage.name}`, days: 1, block: false, checks: ['Hoàn thành hạng mục chính', 'Cập nhật tiến độ', 'Ghi chú phát sinh (nếu có)'] },
    { title: `Kiểm tra trước khi rời cột — ${stage.name}`, days: 0, block: true, checks: ['Đủ chứng từ / ảnh', 'Không còn hạng mục chặn', 'Sẵn sàng chuyển cột kế tiếp'] },
  ];
}

function buildSeedSql() {
  return `
DO $$
DECLARE
  r record;
  tpl_id uuid;
  item record;
  items jsonb;
  install bool;
  n text;
  s text;
  already int;
BEGIN
  FOR r IN
    SELECT id, name, company_id, order_index, bucket_slug, crm_sync_type
    FROM logistics_pipeline_stages
    WHERE is_active IS NOT FALSE
      AND company_id IS NOT NULL
    ORDER BY company_id, order_index
  LOOP
    SELECT COUNT(*) INTO already
    FROM workshop_task_templates t
    WHERE t.workshop_area = 'logistics'
      AND t.company_id = r.company_id
      AND t.logistics_stage_id = r.id
      AND t.is_active IS NOT FALSE;

    IF already > 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO workshop_task_templates (
      name, workshop_area, description, company_id, is_active, is_default, order_index, logistics_stage_id
    ) VALUES (
      'Bộ mẫu — ' || r.name,
      'logistics',
      'Tự tạo theo cột pipeline «' || r.name || '». Gen khi dự án vào cột này.',
      r.company_id,
      true,
      false,
      COALESCE(r.order_index, 0),
      r.id
    )
    RETURNING id INTO tpl_id;

    n := lower(r.name);
    s := lower(COALESCE(r.bucket_slug, ''));
    install := (
      lower(COALESCE(r.crm_sync_type, '')) = 'installation'
      OR s LIKE '%install%'
      OR n LIKE '%lắp%'
      OR n LIKE '%lap dat%'
    );

    -- Item theo nhóm cột (mirror logic seed JS)
    IF s = 'delivery_pending' OR n LIKE '%chờ xác nhận%' OR n LIKE '%chờ vận chuyển%' THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Tiếp nhận bàn giao từ SX', 'high', 0, 1, '[{"text":"Đối chiếu mã dự án / packing list"},{"text":"Kiểm đếm kiện hàng"},{"text":"Xác nhận đủ hồ sơ lắp đặt"}]'::jsonb, true),
        (tpl_id, 'Xác nhận lịch giao với khách', 'high', 0, 2, '[{"text":"Gọi / nhắn khách xác nhận ngày giờ"},{"text":"Ghi địa chỉ + SĐT người nhận"},{"text":"Ghi chú điều kiện công trình"}]'::jsonb, false),
        (tpl_id, 'Chuẩn bị xe & nhân sự VC', 'high', 1, 3, '[{"text":"Chốt tài xế / phụ xe"},{"text":"Chọn xe phù hợp số kiện"},{"text":"Briefing packing list"}]'::jsonb, true);

    ELSIF n LIKE '%xác nhận%' AND NOT install THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Xác nhận đơn sẵn sàng giao', 'high', 0, 1, '[{"text":"Kiểm tra đủ kiện"},{"text":"Xác nhận địa chỉ giao"},{"text":"Chốt khung giờ với khách"}]'::jsonb, true),
        (tpl_id, 'Phân công chuyến giao', 'medium', 0, 2, '[{"text":"Gán tài xế"},{"text":"Gán tuyến / ETA"},{"text":"In / gửi packing list"}]'::jsonb, false);

    ELSIF n LIKE '%đang vận chuyển%' OR (s LIKE '%deliver%' AND NOT install AND n NOT LIKE '%chờ%') THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Kiểm tra trước khi lấy hàng', 'high', 0, 1, '[{"text":"Đối chiếu mã dự án"},{"text":"Kiểm tra số kiện và phụ kiện"},{"text":"Chụp ảnh tổng kiện"}]'::jsonb, false),
        (tpl_id, 'Hàng lên xe và vận chuyển', 'high', 1, 2, '[{"text":"Xếp hàng an toàn"},{"text":"Chụp ảnh hàng trên xe"},{"text":"Xuất phát và theo dõi hành trình"}]'::jsonb, false),
        (tpl_id, 'Cập nhật trạng thái trên đường', 'medium', 1, 3, '[{"text":"Gửi ETA cho khách"},{"text":"Ghi nhận sự cố (nếu có)"},{"text":"Xác nhận đã đến gần công trình"}]'::jsonb, true);

    ELSIF n LIKE '%giao hàng%' AND NOT install THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Kiểm tra trước khi giao', 'high', 0, 1, '[{"text":"Kiểm tra kiện khi đến công trình"},{"text":"Đối chiếu packing list"},{"text":"Ghi nhận hư hỏng / thiếu (nếu có)"}]'::jsonb, true),
        (tpl_id, 'Bàn giao hàng cho bên lắp', 'high', 0, 2, '[{"text":"Bàn giao đủ kiện"},{"text":"Ký biên bản giao nhận"},{"text":"Chụp ảnh bàn giao"}]'::jsonb, false);

    ELSIF n LIKE '%có vấn đề%' OR n LIKE '%có lỗi%' OR s LIKE '%issue%' THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Ghi nhận sự cố', 'high', 0, 1, '[{"text":"Mô tả sự cố rõ ràng"},{"text":"Chụp ảnh / video minh chứng"},{"text":"Phân loại: hư hỏng / thiếu / chậm"}]'::jsonb, true),
        (tpl_id, 'Xử lý & báo cáo', 'high', 1, 2, '[{"text":"Liên hệ khách / nội bộ"},{"text":"Đề xuất phương án xử lý"},{"text":"Cập nhật tiến độ xử lý"}]'::jsonb, false);

    ELSIF n LIKE '%nhận hàng%' THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Kiểm tra và nhận hàng tại công trình', 'high', 0, 1, '[{"text":"Kiểm đếm kiện / phụ kiện"},{"text":"Kiểm tra mặt bằng trước lắp"},{"text":"Xác nhận đủ hàng để lắp"}]'::jsonb, true),
        (tpl_id, 'Chuẩn bị dụng cụ & mặt bằng', 'medium', 0, 2, '[{"text":"Chuẩn bị dụng cụ lắp"},{"text":"Bảo vệ sàn / tường"},{"text":"Phân khu vực thi công"}]'::jsonb, false);

    ELSIF n LIKE '%đang lắp%' OR (install AND n LIKE '%lắp%' AND n NOT LIKE '%nghiệm%' AND n NOT LIKE '%hoàn%') THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Quy trình lắp đặt', 'high', 2, 1, '[{"text":"Lắp theo bản vẽ hiện trường"},{"text":"Ghi nhận phát sinh (nếu có)"},{"text":"Vệ sinh khu vực thi công"}]'::jsonb, false),
        (tpl_id, 'Kiểm tra chất lượng lắp', 'high', 1, 2, '[{"text":"Kiểm tra độ thẳng / khe hở"},{"text":"Kiểm tra bản lề / ray"},{"text":"Chụp ảnh trước nghiệm thu"}]'::jsonb, true);

    ELSIF n LIKE '%nghiệm thu%' THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Nghiệm thu với khách', 'high', 0, 1, '[{"text":"Khách kiểm tra và ký nghiệm thu"},{"text":"Ghi hạng mục tồn / hẹn xử lý"},{"text":"Chụp ảnh công trình hoàn thiện"}]'::jsonb, true),
        (tpl_id, 'Bàn giao hồ sơ', 'medium', 0, 2, '[{"text":"Giao biên bản nghiệm thu"},{"text":"Hướng dẫn sử dụng / bảo hành"},{"text":"Cập nhật trạng thái CRM nếu cần"}]'::jsonb, false);

    ELSIF n LIKE '%hoàn thành%' OR s LIKE '%completed%' OR n LIKE '%bàn giao%' THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Đóng hồ sơ công trình', 'medium', 0, 1, '[{"text":"Đủ biên bản giao / nghiệm thu"},{"text":"Lưu ảnh hoàn thiện"},{"text":"Xác nhận không còn hạng mục treo"}]'::jsonb, false),
        (tpl_id, 'Chăm sóc sau bàn giao', 'low', 1, 2, '[{"text":"Gọi hỏi thăm khách (nếu quy trình yêu cầu)"},{"text":"Ghi nhận phản hồi"},{"text":"Đóng ticket nội bộ"}]'::jsonb, false);

    ELSIF n LIKE '%bảo hành%' OR n LIKE '%cskh%' OR s LIKE '%customer%' THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Tiếp nhận yêu cầu CSKH', 'high', 0, 1, '[{"text":"Ghi nội dung yêu cầu"},{"text":"Phân loại bảo hành / phát sinh"},{"text":"Hẹn lịch xử lý"}]'::jsonb, false),
        (tpl_id, 'Xử lý và đóng yêu cầu', 'high', 2, 2, '[{"text":"Thực hiện sửa / bảo hành"},{"text":"Khách xác nhận hoàn tất"},{"text":"Lưu biên bản"}]'::jsonb, true);

    ELSE
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Thực hiện công việc — ' || r.name, 'medium', 1, 1, '[{"text":"Hoàn thành hạng mục chính"},{"text":"Cập nhật tiến độ"},{"text":"Ghi chú phát sinh (nếu có)"}]'::jsonb, false),
        (tpl_id, 'Kiểm tra trước khi rời cột — ' || r.name, 'high', 0, 2, '[{"text":"Đủ chứng từ / ảnh"},{"text":"Không còn hạng mục chặn"},{"text":"Sẵn sàng chuyển cột kế tiếp"}]'::jsonb, true);
    END IF;

    RAISE NOTICE 'Created template % for stage % (%)', tpl_id, r.name, r.company_id;
  END LOOP;
END $$;
`;
}

async function main() {
  if (!TOKEN) {
    console.error('Thiếu SUPABASE_ACCESS_TOKEN');
    process.exit(1);
  }
  const sql = buildSeedSql();
  // Also save as migration file for history
  const fs = require('fs');
  const migPath = path.join(__dirname, '..', '..', 'database', '437_seed_vc_ld_stage_task_templates.sql');
  fs.writeFileSync(migPath, `-- 437: Seed bộ nhiệm vụ theo từng cột pipeline VC/LĐ (mọi công ty có stages)\n-- Idempotent.\n\n${sql}\n`, 'utf8');
  console.log('Wrote', migPath);

  for (const { ref, label } of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log('Running on', label, ref);
    await runQuery(ref, sql, label);
    const check = await runQuery(ref, `
      SELECT c.name AS company, s.name AS stage, t.name AS template,
        (SELECT COUNT(*) FROM workshop_task_template_items i WHERE i.template_id = t.id) AS items
      FROM workshop_task_templates t
      JOIN logistics_pipeline_stages s ON s.id = t.logistics_stage_id
      JOIN companies c ON c.id = t.company_id
      WHERE t.workshop_area = 'logistics' AND t.is_active IS NOT FALSE
      ORDER BY c.name, s.order_index;
    `, `${label}-check`);
    console.log(label, 'templates:', Array.isArray(check) ? check.length : check);
    if (Array.isArray(check)) {
      for (const row of check) console.log(`  - ${row.company} | ${row.stage} | ${row.template} (${row.items} việc)`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
