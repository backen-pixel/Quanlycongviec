const fs = require('fs');
const path = require('path');
const { lessonImageFile, publicUrl, UPLOAD_DIR, CAPTURE_SRC_DIR, COURSES, LESSONS_PER_COURSE } = require('./manifest');

const REPO_ROOT = path.join(__dirname, '../../..');
const UPLOAD_ABS = path.join(REPO_ROOT, UPLOAD_DIR);
const CAPTURE_ABS = path.join(REPO_ROOT, CAPTURE_SRC_DIR);
const STORAGE_URLS_FILE = path.join(__dirname, 'storage-urls.json');

/** URL public Supabase Storage (ưu tiên) — sinh bởi upload-screenshots-storage.js */
function loadStorageUrls() {
  try {
    if (!fs.existsSync(STORAGE_URLS_FILE)) return {};
    return JSON.parse(fs.readFileSync(STORAGE_URLS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function resolveImageUrl(file) {
  const storageUrls = loadStorageUrls();
  if (storageUrls[file]) return storageUrls[file];
  return publicUrl(file);
}

function imageExists(course, lessonNum) {
  const file = lessonImageFile(course, lessonNum);
  return fs.existsSync(path.join(CAPTURE_ABS, file)) || fs.existsSync(path.join(UPLOAD_ABS, file));
}

function resolveImageFile(course, lessonNum) {
  const standard = lessonImageFile(course, lessonNum);
  if (fs.existsSync(path.join(CAPTURE_ABS, standard))) return standard;
  if (fs.existsSync(path.join(UPLOAD_ABS, standard))) return standard;
  return null;
}

/**
 * Gắn ảnh bìa + gallery + inline markdown cho mọi bài (1–13) cả 3 khoá.
 */
function enrichLesson(course, lessonNum, lesson) {
  const file = resolveImageFile(course, lessonNum);
  if (!file) return lesson;

  const url = resolveImageUrl(file);
  const caption = lesson.summary || lesson.title || `Minh họa bài ${lessonNum}`;

  let content_md = lesson.content_md || '';
  const localPath = publicUrl(file);
  if (url !== localPath) {
    content_md = content_md.split(localPath).join(url);
  }
  content_md = content_md.replace(
    new RegExp(`/uploads/knowledge-screenshots/${file.replace('.', '\\.')}`, 'g'),
    url,
  );
  const inlineBlock = `\n![${caption}](${url})\n`;

  if (!content_md.includes(url) && !content_md.includes(file)) {
    const anchors = ['## 4. Vận hành', '## 3. Trước khi thi', '## 1. Mục đích'];
    const anchor = anchors.find((a) => content_md.includes(a));
    if (anchor) {
      content_md = content_md.replace(anchor, `${inlineBlock}${anchor}`);
    } else {
      content_md += `\n## Minh họa trên phần mềm\n${inlineBlock}`;
    }
  }

  const attachment = { type: 'image', url, caption };
  const existing = (lesson.attachments || []).filter(
    (a) => a?.url !== url,
  );

  const exercises = (lesson.exercises || []).map((ex) => ({
    ...ex,
    image_url: url,
    attachments: [
      attachment,
      ...(ex.attachments || []).filter((a) => a?.url !== url),
    ],
  }));

  return {
    ...lesson,
    content_md,
    cover_image_url: url,
    attachments: [attachment, ...existing],
    exercises,
  };
}

/** Thống kê ảnh đã có trên disk */
function scanCoverage() {
  const missing = [];
  const have = [];
  for (const course of COURSES) {
    for (let n = 1; n <= LESSONS_PER_COURSE; n += 1) {
      const key = `${course}-${String(n).padStart(2, '0')}`;
      if (imageExists(course, n)) have.push(key);
      else missing.push(key);
    }
  }
  return { have, missing, total: COURSES.length * LESSONS_PER_COURSE };
}

module.exports = {
  enrichLesson,
  UPLOAD_ABS,
  resolveImageFile,
  resolveImageUrl,
  scanCoverage,
  loadStorageUrls,
};
