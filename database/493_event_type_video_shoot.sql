-- 493: Thêm loại sự kiện «Đi quay hình»
INSERT INTO event_types (name, slug, icon, color, stage_slug, description, is_system, sort_order)
VALUES (
  'Đi quay hình',
  'video_shoot',
  '🎥',
  '#7C3AED',
  NULL,
  'Đi quay hình / quay video tại hiện trường',
  TRUE,
  10
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  description = EXCLUDED.description,
  is_system = EXCLUDED.is_system,
  sort_order = EXCLUDED.sort_order;
