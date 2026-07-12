/**
 * Thư viện kỹ năng bot từ file JSON (backend/data/ai-bot-skills/*.json).
 * Bổ sung cho ai_bot_user_skills (DB) — dùng cho skill hệ thống / deploy git.
 */
const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '..', '..', 'data', 'ai-bot-skills');

let cache = { loadedAt: null, files: [], skills: [], errors: [] };

function normalizeSkill(raw, sourceFile) {
  if (!raw || typeof raw !== 'object') return null;
  const code = String(raw.code || '').trim();
  if (!code) return null;
  const skillType = raw.skill_type || 'instruction';
  const config = raw.config && typeof raw.config === 'object' ? { ...raw.config } : {};
  if (raw.report_type && !config.report_type) config.report_type = raw.report_type;
  if (raw.company_name && !config.company_name) config.company_name = raw.company_name;
  if (raw.department_name && !config.department_name) config.department_name = raw.department_name;
  if (raw.run_times && !config.run_times) config.run_times = raw.run_times;
  if (raw.time_scope && !config.time_scope) config.time_scope = raw.time_scope;

  return {
    code,
    skill_type: skillType,
    title: String(raw.title || code).slice(0, 200),
    summary: raw.summary ? String(raw.summary).slice(0, 500) : null,
    instruction: raw.instruction ? String(raw.instruction).slice(0, 400) : null,
    when_to_use: raw.when_to_use ? String(raw.when_to_use).slice(0, 300) : null,
    enabled: raw.enabled !== false,
    auto_create_schedule: raw.auto_create_schedule === true,
    config,
    source: 'json_file',
    source_file: sourceFile,
  };
}

function loadSkillLibrary(force = false) {
  if (!force && cache.loadedAt && cache.skills.length) return cache;

  const skills = [];
  const files = [];
  const errors = [];

  if (!fs.existsSync(SKILLS_DIR)) {
    cache = { loadedAt: new Date().toISOString(), files: [], skills: [], errors: [`Thư mục không tồn tại: ${SKILLS_DIR}`] };
    return cache;
  }

  const jsonFiles = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.json')).sort();
  const codes = new Set();

  for (const file of jsonFiles) {
    const fullPath = path.join(SKILLS_DIR, file);
    files.push(file);
    try {
      const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const list = Array.isArray(raw) ? raw : (Array.isArray(raw.skills) ? raw.skills : []);
      if (!list.length) {
        errors.push(`${file}: không có mảng skills`);
        continue;
      }
      for (const item of list) {
        const sk = normalizeSkill(item, file);
        if (!sk) {
          errors.push(`${file}: skill thiếu code`);
          continue;
        }
        if (codes.has(sk.code)) {
          errors.push(`Trùng code "${sk.code}" — bỏ qua bản sau`);
          continue;
        }
        codes.add(sk.code);
        skills.push(sk);
      }
    } catch (e) {
      errors.push(`${file}: ${e.message}`);
    }
  }

  cache = {
    loadedAt: new Date().toISOString(),
    files,
    skills,
    errors,
    dir: SKILLS_DIR,
  };
  return cache;
}

function listLibrarySkills({ enabled_only = false } = {}) {
  const lib = loadSkillLibrary();
  let skills = lib.skills;
  if (enabled_only) skills = skills.filter((s) => s.enabled);
  return {
    loaded_at: lib.loadedAt,
    dir: lib.dir,
    files: lib.files,
    errors: lib.errors,
    skills,
    total: skills.length,
  };
}

function getLibrarySkill(code) {
  if (!code) return null;
  const lib = loadSkillLibrary();
  return lib.skills.find((s) => s.code === String(code).trim()) || null;
}

/** Map skill JSON → tham số createAiBotSchedule */
function librarySkillToScheduleArgs(skill, overrides = {}) {
  if (!skill) throw new Error('Skill không tồn tại');
  const cfg = skill.config || {};
  return {
    title: overrides.title || skill.title,
    report_type: overrides.report_type || cfg.report_type || 'org_overview',
    company_id: overrides.company_id || cfg.company_id || null,
    company_name: overrides.company_name || cfg.company_name || null,
    department_id: overrides.department_id || cfg.department_id || null,
    department_name: overrides.department_name || cfg.department_name || null,
    run_times: overrides.run_times || cfg.run_times || ['08:00'],
    time_scope: overrides.time_scope || cfg.time_scope || 'today',
    weekdays: overrides.weekdays || cfg.weekdays || null,
    channel_type: overrides.channel_type || cfg.channel_type || null,
    channel_id: overrides.channel_id || cfg.channel_id || null,
    note: overrides.note || skill.summary || null,
    instruction: overrides.instruction || skill.instruction || skill.title,
    enabled: overrides.enabled != null ? overrides.enabled : skill.enabled,
    skill_code: skill.code,
    skill_source: 'json_file',
  };
}

function formatLibraryForPrompt(limit = 12) {
  const lib = loadSkillLibrary();
  if (!lib.skills.length) return '';
  const lines = lib.skills.filter((s) => s.enabled).slice(0, limit).map((s) => {
    const rt = s.config?.report_type || s.skill_type;
    const times = Array.isArray(s.config?.run_times) ? s.config.run_times.join(',') : '';
    const when = s.when_to_use ? ` — ${s.when_to_use}` : '';
    return `- ${s.code}: ${s.title} (${rt}${times ? ` · ${times}` : ''})${when}\n  → preview_skill skill_code=${s.code} hoặc preview (auto khớp)`;
  });
  return lines.length
    ? `KỸ NĂNG / BOT TỪ FILE JSON (${lib.files.join(', ')}):\n${lines.join('\n')}\n→ Tạo lịch: manage_ai_bot_schedule(action='preview_skill', skill_code='...') hoặc preview (tự khớp bot).`
    : '';
}

function safeLibraryFilename(name) {
  const base = path.basename(String(name || '').trim());
  if (!base || !base.endsWith('.json') || base.includes('..')) {
    throw new Error('Tên file không hợp lệ — chỉ *.json trong thư mục skills');
  }
  return base;
}

function readLibraryFile(filename) {
  const base = safeLibraryFilename(filename);
  const fullPath = path.join(SKILLS_DIR, base);
  if (!fs.existsSync(fullPath)) throw new Error('File không tồn tại');
  const content = fs.readFileSync(fullPath, 'utf8');
  JSON.parse(content);
  return { filename: base, content, path: fullPath };
}

function saveLibraryFile(filename, content) {
  const base = safeLibraryFilename(filename);
  const parsed = JSON.parse(String(content || '{}'));
  const fullPath = path.join(SKILLS_DIR, base);
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  loadSkillLibrary(true);
  return { filename: base, ok: true };
}

module.exports = {
  SKILLS_DIR,
  loadSkillLibrary,
  listLibrarySkills,
  getLibrarySkill,
  librarySkillToScheduleArgs,
  formatLibraryForPrompt,
  readLibraryFile,
  saveLibraryFile,
  safeLibraryFilename,
};
