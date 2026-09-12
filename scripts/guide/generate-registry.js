#!/usr/bin/env node
/**
 * Sinh bản đồ màn hình cho Trợ lý hướng dẫn (CopilotKit) từ App.jsx + Sidebar.jsx.
 *
 * Đọc TRỰC TIẾP source (không chạy build), quét theo dòng — vì cả hai file đều viết
 * JSX một dòng/route, một dòng/menu-item nhất quán. Không dùng AST vì đây là script
 * dev-time chạy thủ công (npm run guide:sync), không phải type-checker.
 *
 * Xuất ra HAI file, PHẢI phủ cùng một tập path (xem docs/guide-assistant-architecture.md §2.2 D2):
 *   1. frontend/src/features/guide/data/screenRegistry.js — path/label/menu, client dùng để
 *      validate điều hướng (matchScreen). KHÔNG chứa summary/keywords → không phình bundle.
 *   2. backend/data/guide-knowledge/screens.json — bản đầy đủ, backend tra cứu.
 *      Chạy lần đầu → summary/keywords để trống, người viết tay điền sau (xem README ở cuối script).
 *
 * Chạy: node scripts/guide/generate-registry.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const APP_JSX = path.join(ROOT, 'frontend/src/App.jsx');
const SIDEBAR_JSX = path.join(ROOT, 'frontend/src/components/Sidebar.jsx');
const OUT_CLIENT = path.join(ROOT, 'frontend/src/features/guide/data/screenRegistry.js');
const OUT_SERVER = path.join(ROOT, 'backend/data/guide-knowledge/screens.json');

const MODULE_LABELS = {
  crm: 'CRM',
  production: 'Sản xuất',
  sx: 'Sản xuất',
  logistics: 'Vận chuyển',
  vc: 'Vận chuyển',
  knowledge: 'Kiến thức',
  calc: 'Tính toán',
  ketoan: 'Kế toán',
  muahang: 'Mua hàng',
  platform: 'Nền tảng SaaS',
};

// ─── 1. App.jsx → danh sách path (stack theo <Route>/</Route>, xem đầu file) ───
function parseRoutes(appJsxSrc) {
  const lines = appJsxSrc.split('\n');
  const routes = []; // { path, adminOnly, redirect }
  const stack = ['']; // parent path đang mở

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const closeCount = (line.match(/<\/Route>/g) || []).length;

    const openMatch = line.match(/<Route\s+([^>]*)>/);
    if (openMatch) {
      const attrs = openMatch[1];
      const pathAttr = attrs.match(/\bpath="([^"]*)"/);
      const isIndex = /(^|\s)index(\s|=|>|$)/.test(attrs) || /\sindex\b/.test(attrs);
      const selfClosing = line.trimEnd().endsWith('/>');
      const parent = stack[stack.length - 1];

      let resolved = null;
      if (pathAttr) {
        const p = pathAttr[1];
        resolved = p.startsWith('/') ? p : `${parent.replace(/\/$/, '')}/${p}`;
      } else if (isIndex) {
        resolved = parent || '/';
      }

      if (resolved && !isIndex) {
        const adminOnly = /Require(CrmElevated|Executive|PlatformAdmin|CrmSocialInbox)/.test(attrs)
          || /Require(CrmElevated|Executive|PlatformAdmin|CrmSocialInbox)/.test(line);
        const redirect = /<Navigate\b/.test(attrs) || /<Navigate\b/.test(line);
        routes.push({ path: resolved, adminOnly, redirect });
      }

      if (!selfClosing) {
        stack.push(resolved != null ? resolved : parent);
      }
    }

    for (let i = 0; i < closeCount; i += 1) {
      if (stack.length > 1) stack.pop();
    }
  }

  // dedupe theo path (route trùng do alias `element` khác nhau — giữ bản đầu)
  const seen = new Map();
  for (const r of routes) {
    if (!seen.has(r.path)) seen.set(r.path, r);
  }
  return [...seen.values()].sort((a, b) => a.path.localeCompare(b.path));
}

// ─── 2. Sidebar.jsx → { path -> { label, menu, adminOnly } } ───
function parseSidebarMenu(sidebarJsxSrc) {
  const lines = sidebarJsxSrc.split('\n');
  const map = new Map();
  let currentTitle = null;
  let currentModuleKey = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const titleMatch = line.match(/^title:\s*['"]([^'"]+)['"]/);
    if (titleMatch) currentTitle = titleMatch[1];

    const moduleKeyMatch = line.match(/^moduleKey:\s*['"]([^'"]+)['"]/);
    if (moduleKeyMatch) currentModuleKey = moduleKeyMatch[1];

    // Item đóng khối group ({ id: 'xxx', ... items: [...] }) → reset khi gặp `];` đóng mảng nhóm
    if (/^\];?$/.test(line) && !line.includes('items')) {
      // không chắc chắn ranh giới nhóm — bỏ qua, currentTitle sẽ bị ghi đè bởi group kế tiếp
    }

    const itemMatch = line.match(/\{\s*to:\s*['"]([^'"]+)['"][^}]*label:\s*['"]([^'"]+)['"]/);
    if (itemMatch) {
      const to = itemMatch[1].split('?')[0]; // bỏ query string (?module=crm)
      const label = itemMatch[2];
      const adminOnly = /adminOnly:\s*true|strictAdminOnly:\s*true|executiveOnly:\s*true|tenantAdminOnly:\s*true/.test(line);
      const moduleLabel = MODULE_LABELS[currentModuleKey] || null;
      const menu = moduleLabel && currentTitle ? `${moduleLabel} → ${currentTitle}` : (currentTitle || moduleLabel || '');
      if (!map.has(to)) {
        map.set(to, { label, menu, adminOnly });
      }
    }
  }
  return map;
}

function main() {
  const appSrc = fs.readFileSync(APP_JSX, 'utf8');
  const sidebarSrc = fs.readFileSync(SIDEBAR_JSX, 'utf8');

  const routes = parseRoutes(appSrc);
  const menuMap = parseSidebarMenu(sidebarSrc);

  // Giữ mô tả viết tay (summary/keywords/actions) đã có từ lần chạy trước — generator
  // chỉ SINH khung, không được ghi đè phần người đã điền tay (nguyên tắc D3).
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(OUT_SERVER, 'utf8'));
  } catch { /* chưa có file — chạy lần đầu */ }
  const existingByPath = new Map(existing.map((e) => [e.path, e]));

  const clientEntries = [];
  const serverEntries = [];
  let missingDesc = 0;

  for (const r of routes) {
    const menuInfo = menuMap.get(r.path) || null;
    const prev = existingByPath.get(r.path) || {};
    // Route KHÔNG nằm trên Sidebar (chi tiết, form, layout…) không có label để sinh ra. Nếu người
    // đã đặt tên tay trong screens.json thì giữ nguyên — cùng nguyên tắc D3 với summary/keywords,
    // nếu không thì rơi về path như trước.
    const prevLabel = prev.label && prev.label !== r.path ? prev.label : null;
    const label = menuInfo?.label || prevLabel || r.path;
    const menu = menuInfo?.menu || prev.menu || '';
    const needs_admin = r.adminOnly || menuInfo?.adminOnly || false;

    clientEntries.push({ path: r.path, label, menu });

    serverEntries.push({
      path: r.path,
      label,
      menu,
      needs_admin,
      redirect: r.redirect || false,
      summary: prev.summary || '',
      keywords: prev.keywords || [],
      ...(prev.actions ? { actions: prev.actions } : {}),
    });
    if (!r.redirect && !prev.summary) missingDesc += 1;
  }

  const clientOut = `// SINH TỰ ĐỘNG bởi scripts/guide/generate-registry.js — KHÔNG SỬA TAY.
// Chạy lại: npm run guide:sync (ở backend/, xem package.json).
// Chỉ path/label/menu — dùng cho matchScreen() phía client. Chi tiết tra cứu nằm ở backend.

export const SCREEN_REGISTRY = ${JSON.stringify(clientEntries, null, 2)};

export const MODULE_INDEX = ${JSON.stringify(buildModuleIndex(clientEntries), null, 2)};
`;

  fs.mkdirSync(path.dirname(OUT_CLIENT), { recursive: true });
  fs.writeFileSync(OUT_CLIENT, clientOut, 'utf8');

  fs.mkdirSync(path.dirname(OUT_SERVER), { recursive: true });
  fs.writeFileSync(OUT_SERVER, JSON.stringify(serverEntries, null, 2), 'utf8');

  console.log(`✅ guide:sync — ${routes.length} route → ${OUT_CLIENT.replace(ROOT, '.')}, ${OUT_SERVER.replace(ROOT, '.')}`);
  if (missingDesc > 0) {
    console.log(`⚠️  ${missingDesc} màn hình chưa có summary/keywords — điền tay trong screens.json rồi chạy lại,`);
    console.log('   hoặc chạy `npm run guide:check -- --update-baseline` để tạm miễn trừ (xem check-drift.js).');
  }
}

/** Mục lục module gọn (~10 module, mỗi module vài nhóm) — gửi lên model mỗi lượt hỏi. */
function buildModuleIndex(entries) {
  const byModule = new Map();
  for (const e of entries) {
    const moduleLabel = (e.menu || '').split(' → ')[0] || 'Khác';
    if (!byModule.has(moduleLabel)) byModule.set(moduleLabel, new Set());
    const group = (e.menu || '').split(' → ')[1] || null;
    if (group) byModule.get(moduleLabel).add(group);
  }
  return [...byModule.entries()].map(([module, groups]) => ({
    module,
    groups: [...groups],
  }));
}

main();
