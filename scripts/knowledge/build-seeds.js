#!/usr/bin/env node
/**
 * Sinh file SQL seed Kiến thức: 259 (Lead), 262 (Deal), 263 (Hướng dẫn CRM).
 * Chạy: node scripts/knowledge/build-seeds.js
 */
const fs = require('fs');
const path = require('path');
const { lessonInsert, exerciseInsert } = require('./lib');
const guide = require('./courses/guide');
const lead = require('./courses/lead');
const deal = require('./courses/deal');

const DB = path.join(__dirname, '../../database');

function header(fileNum, title, desc) {
  return `-- ${fileNum}
-- ${title}
-- ${desc}
-- Sinh tự động bởi scripts/knowledge/build-seeds.js — không sửa tay; chạy lại script để cập nhật.
-- Idempotent: ON CONFLICT DO UPDATE

BEGIN;

ALTER TABLE knowledge_lessons
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE knowledge_exercises
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS video_type TEXT,
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS time_limit_minutes INT;

`;
}

function categoryBlock(cat) {
  return `-- DANH MỤC
INSERT INTO knowledge_categories (id, name, slug, description, icon, sort_order, is_active)
VALUES (
  ${q(cat.id)},
  ${q(cat.name)},
  ${q(cat.slug)},
  ${q(cat.description)},
  ${q(cat.icon)},
  ${cat.sort_order},
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon, is_active = true;

UPDATE knowledge_categories SET
  deadline_mode = ${q(cat.deadline_mode || 'relative')},
  deadline_duration_days = ${cat.deadline_duration_days ?? 'NULL'},
  deadline_note = ${cat.deadline_note ? q(cat.deadline_note) : 'NULL'},
  require_all_exercises_passed = ${cat.require_all_exercises_passed !== false}
WHERE id = ${q(cat.id)};

`;
}

function q(s) {
  if (s == null) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function buildCourse(fileNum, filename, course) {
  const parts = [header(fileNum, course.title, course.description), categoryBlock(course.category)];
  parts.push('-- BÀI HỌC\n');
  for (const lesson of course.lessons) {
    parts.push(lessonInsert(lesson, course.category.id));
    parts.push('\n');
  }
  parts.push('-- BÀI TẬP\n');
  for (const lesson of course.lessons) {
    for (const ex of lesson.exercises || []) {
      parts.push(exerciseInsert(ex));
      parts.push('\n');
    }
  }
  parts.push('COMMIT;\n');
  const out = path.join(DB, filename);
  fs.writeFileSync(out, parts.join(''), 'utf8');
  console.log('Wrote', out, `(${course.lessons.length} lessons)`);
}

function main() {
  buildCourse('263', '263_knowledge_seed_crm_software_guide.sql', guide);
  buildCourse('259', '259_knowledge_seed_lead_course.sql', lead);
  buildCourse('262', '262_knowledge_seed_deal_course.sql', deal);

  const stub264 = `-- 264_knowledge_crm_guide_extra_features.sql
-- DEPRECATED: Nội dung đã gộp vào 263 (scripts/knowledge/build-seeds.js).
-- Giữ file để migration cũ không lỗi — chạy an toàn, không thay đổi dữ liệu.

BEGIN;
COMMIT;
`;
  fs.writeFileSync(path.join(DB, '264_knowledge_crm_guide_extra_features.sql'), stub264, 'utf8');
  console.log('Wrote 264 stub');
}

main();
