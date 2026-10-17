/**
 * Script nhập module kiến thức vào database
 * Cập nhật bài học từ file JSON vào Supabase
 *
 * Sử dụng:
 * node backend/scripts/import-knowledge-module.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { supabase } = require('../src/config/supabase');

const CATEGORY_NAME = 'Quản lý Xưởng Sản Xuất — Từ Lý Thuyết Đến Thực Hành';
const CATEGORY_SLUG = 'workshop-management-v2';

async function main() {
  console.log('🚀 Bắt đầu nhập module kiến thức...\n');

  try {
    // 1. Kiểm tra/tạo category
    console.log('1️⃣ Kiểm tra danh mục...');
    let { data: existingCat, error: catError } = await supabase
      .from('knowledge_categories')
      .select('id, name')
      .eq('slug', CATEGORY_SLUG)
      .maybeSingle();

    let categoryId;
    if (existingCat) {
      categoryId = existingCat.id;
      console.log(`   ✅ Danh mục đã tồn tại: ${existingCat.name} (ID: ${categoryId})\n`);
    } else {
      console.log('   📝 Tạo danh mục mới...');
      const { data: newCat, error: createError } = await supabase
        .from('knowledge_categories')
        .insert({
          name: CATEGORY_NAME,
          slug: CATEGORY_SLUG,
          description: 'Môđun kiến thức toàn diện về quản lý xưởng sản xuất, từ nền tảng lý thuyết đến kỹ năng thực hành',
          icon: '🏭',
          is_active: true,
          sort_order: 1,
        })
        .select()
        .single();

      if (createError) throw createError;
      categoryId = newCat.id;
      console.log(`   ✅ Danh mục mới được tạo: ${newCat.name} (ID: ${categoryId})\n`);
    }

    // 2. Xóa các bài cũ
    console.log('2️⃣ Xóa bài cũ...');
    const { error: deleteError } = await supabase
      .from('knowledge_lessons')
      .delete()
      .eq('category_id', categoryId);
    if (deleteError) throw deleteError;
    console.log('   ✅ Bài cũ đã được xóa\n');

    // 3. Đọc file dữ liệu bài học
    console.log('3️⃣ Đọc file dữ liệu bài học...');
    const lessonsFile = path.join(__dirname, '../uploads/_lessons_revised_academic.json');
    const purposeLessonsFile = path.join(__dirname, '../uploads/_lesson_purpose_education.json');
    const quizFile = path.join(__dirname, '../uploads/_quiz_advanced_v2.json');

    if (!fs.existsSync(lessonsFile)) {
      throw new Error(`File không tìm thấy: ${lessonsFile}`);
    }

    const academicLessons = JSON.parse(fs.readFileSync(lessonsFile, 'utf-8'));
    const purposeLessons = JSON.parse(fs.readFileSync(purposeLessonsFile, 'utf-8'));
    const quizData = JSON.parse(fs.readFileSync(quizFile, 'utf-8'));

    console.log(`   ✅ Đã đọc ${academicLessons.lessons.length} bài thực hành`);
    console.log(`   ✅ Đã đọc ${purposeLessons.lessons.length} bài nền tảng`);
    console.log(`   ✅ Đã đọc ${quizData.items?.length || 0} câu kiểm tra\n`);

    // 4. Nhập bài nền tảng (Giai đoạn 1)
    console.log('4️⃣ Nhập bài nền tảng (Giai đoạn 1)...');
    const foundationLessons = [];
    for (let i = 0; i < purposeLessons.lessons.length; i++) {
      const lesson = purposeLessons.lessons[i];
      const { data: inserted, error: insError } = await supabase
        .from('knowledge_lessons')
        .insert({
          category_id: categoryId,
          title: lesson.title,
          summary: lesson.title,
          content_md: lesson.content_md,
          sort_order: i + 1,
          is_published: true,
          target_roles: [],
          tags: ['nền_tảng', 'giai_đoạn_1'],
        })
        .select()
        .single();

      if (insError) throw insError;
      foundationLessons.push(inserted);
      console.log(`   ✅ Bài ${i + 1}: ${lesson.title}`);
    }
    console.log();

    // 5. Nhập bài thực hành (Giai đoạn 2)
    console.log('5️⃣ Nhập bài thực hành (Giai đoạn 2)...');
    const practicalLessons = [];
    for (let i = 0; i < academicLessons.lessons.length; i++) {
      const lesson = academicLessons.lessons[i];
      const { data: inserted, error: insError } = await supabase
        .from('knowledge_lessons')
        .insert({
          category_id: categoryId,
          title: lesson.title,
          summary: lesson.summary,
          content_md: lesson.content_md,
          sort_order: foundationLessons.length + i + 1,
          is_published: true,
          target_roles: [],
          tags: ['thực_hành', 'giai_đoạn_2'],
        })
        .select()
        .single();

      if (insError) throw insError;
      practicalLessons.push(inserted);
      console.log(`   ✅ Bài ${foundationLessons.length + i + 1}: ${lesson.title}`);
    }
    console.log();

    // 6. Tạo bài kiểm tra (Giai đoạn 3)
    console.log('6️⃣ Tạo bài kiểm tra (Giai đoạn 3)...');
    const lastLessonOrder = foundationLessons.length + practicalLessons.length + 1;
    const { data: quizLesson, error: quizLessonError } = await supabase
      .from('knowledge_lessons')
      .insert({
        category_id: categoryId,
        title: 'Bài kiểm tra nâng cao — 20 câu hỏi',
        summary: 'Đánh giá kiến thức và kỹ năng đã học',
        content_md: '# Bài Kiểm Tra Nâng Cao\n\nBài kiểm tra này gồm 20 câu hỏi nhằm kiểm tra kiến thức và khả năng phân tích tình huống thực tế.\n\n**Yêu cầu**: Đạt ≥ 70 điểm\n**Số lượt**: 3\n**Độ khó**: 80% cao',
        sort_order: lastLessonOrder,
        is_published: true,
        target_roles: [],
        tags: ['kiểm_tra', 'giai_đoạn_3', 'bài_thi_tổng_kết'],
        is_final_exam: true,
      })
      .select()
      .single();

    if (quizLessonError) throw quizLessonError;
    console.log(`   ✅ Bài kiểm tra được tạo: ${quizLesson.title}\n`);

    // 7. Tạo exercise kiểm tra
    console.log('7️⃣ Tạo bài tập kiểm tra...');
    const { data: quizExercise, error: exError } = await supabase
      .from('knowledge_exercises')
      .insert({
        lesson_id: quizLesson.id,
        title: 'Kiểm tra 20 câu',
        instructions: 'Trả lời tất cả các câu hỏi. Mỗi câu hỏi có một hoặc nhiều đáp án đúng.',
        type: 'quiz',
        questions: {
          items: quizData.items || [],
        },
        passing_score: 70,
        max_attempts: 3,
        sort_order: 1,
      })
      .select()
      .single();

    if (exError) throw exError;
    console.log(`   ✅ Bài kiểm tra được tạo: ${quizExercise.title}\n`);

    // 8. Thống kê kết quả
    console.log('📊 ════════════════════════════════════════════════════════');
    console.log('📊 HOÀN TẤT NHẬP MODULE KIẾN THỨC');
    console.log('📊 ════════════════════════════════════════════════════════\n');
    console.log(`✅ Danh mục: ${CATEGORY_NAME}`);
    console.log(`✅ Bài nền tảng: ${foundationLessons.length} bài`);
    console.log(`✅ Bài thực hành: ${practicalLessons.length} bài`);
    console.log(`✅ Bài kiểm tra: 1 bài (20 câu hỏi)`);
    console.log(`✅ Tổng bài: ${foundationLessons.length + practicalLessons.length + 1} bài`);
    console.log(`\n🔗 Category ID: ${categoryId}\n`);

    // 9. Hướng dẫn tiếp theo
    console.log('📝 ════════════════════════════════════════════════════════');
    console.log('📝 BƯỚC TIẾP THEO');
    console.log('📝 ════════════════════════════════════════════════════════\n');
    console.log('1. Đăng nhập vào ứng dụng với tài khoản admin');
    console.log('2. Vào phần "Kiến thức" → "Quản lý nội dung"');
    console.log(`3. Kiểm tra danh mục "${CATEGORY_NAME}"`);
    console.log('4. Xác nhận tất cả các bài học đã được cập nhật');
    console.log('5. Thử làm bài kiểm tra để đảm bảo mọi thứ hoạt động bình thường\n');

    console.log('✅ Script hoàn tất thành công!');
    process.exit(0);
  } catch (e) {
    console.error('\n❌ LỖI:', e.message);
    console.error('\nChitiết lỗi:', e);
    process.exit(1);
  }
}

main();
