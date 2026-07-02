import { useMemo, useState, useLayoutEffect } from 'react';
import { useTheme } from '../components/ThemeProvider';

/** Class bọc vùng Kanban — tắt glass theme trên thẻ/cột. */
export const UI_KANBAN_FIXED_CLASS = 'ui-kanban-fixed';

/** Vùng danh sách thẻ — trong suốt, không blur (xưởng + CRM). */
export const KANBAN_CARDS_BODY_CLASS = 'kanban-cards-body';

/** Placeholder cột trống — nền xám mờ nhẹ, icon + chữ nổi bật hơn. */
export const KANBAN_COLUMN_EMPTY_CLASS = 'kanban-column-empty';

/** Placeholder trống dính dưới header khi cuộn board chung (không có thẻ). */
export const KANBAN_COLUMN_EMPTY_PIN_CLASS = 'kanban-column-empty--scroll-pinned';

/** Vùng thẻ cột trống — cho phép sticky placeholder trong cuộn chung. */
export const KANBAN_CARDS_BODY_EMPTY_PIN_CLASS = 'kanban-cards-body--empty-pinned';

/** Hàng cột Kanban — đường kẻ dọc đứt khúc giữa các cột (Bitrix-style). */
export const KANBAN_BOARD_COLUMN_RAILS_CLASS = 'kanban-board-column-rails';

/** Cột Kanban — có đường kẻ dọc đứt khúc bên trái. */
export const KANBAN_COLUMN_RAIL_CLASS = 'kanban-column-rail';

/** Thẻ Kanban pipeline (CRM + SX). */
export const KANBAN_PIPELINE_CARD_CLASS = 'kanban-pipeline-card';

/** Viền thẻ — 4px trái theo màu cột, cạnh còn lại xám (hoặc tone cảnh báo). */
export function getKanbanPipelineCardBorderStyle(columnAccent, tone = 'default') {
  const accent = columnAccent || '#94a3b8';
  const side = tone === 'overdue' ? '#fca5a5' : tone === 'selected' ? '#93c5fd' : '#e5e7eb';
  return {
    borderLeft: `4px solid ${accent}`,
    borderTop: `1px solid ${side}`,
    borderRight: `1px solid ${side}`,
    borderBottom: `1px solid ${side}`,
  };
}

/**
 * Đo chiều cao header cột — dùng làm `top` cho placeholder trống khi cuộn dọc board.
 * @param {import('react').RefObject<HTMLElement|null>} headerRef
 * @param {boolean} enabled
 */
export function useKanbanEmptyPlaceholderStickyTop(headerRef, enabled) {
  const [topPx, setTopPx] = useState(56);

  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const el = headerRef.current;
    if (!el) return undefined;

    const measure = () => {
      setTopPx(Math.ceil(el.getBoundingClientRect().height));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [headerRef, enabled]);

  return topPx;
}

/** Bảng màu cố định theo thứ tự cột (cột 0, 1, 2…). */
const ZONE_PALETTE = [
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#0891b2',
  '#84cc16',
  '#d946ef',
  '#f43f5e',
];

/** Màu accent theo vị trí cột — không lấy từ stage.color / viền pipeline. */
export function getKanbanColumnAccent(columnIndex = 0) {
  const i = ((columnIndex % ZONE_PALETTE.length) + ZONE_PALETTE.length) % ZONE_PALETTE.length;
  return ZONE_PALETTE[i];
}

function parseRgb(color) {
  const raw = String(color || '').trim();
  if (!raw) return null;
  if (raw.startsWith('#')) {
    let h = raw.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length >= 6) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      if ([r, g, b].every((n) => Number.isFinite(n))) return [r, g, b];
    }
  }
  const m = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

function toHex(n) {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
}

export function relativeLuminance(r, g, b) {
  const lin = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrastRatio(lumA, lumB) {
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Pha màu với trắng → hex đặc (whiteRatio càng cao càng nhạt). */
export function mixKanbanWithWhite(color, whiteRatio = 0.85) {
  const rgb = parseRgb(color) || [148, 163, 184];
  const [r, g, b] = rgb;
  const w = Math.max(0, Math.min(1, whiteRatio));
  const mix = (c) => Math.round(c + (255 - c) * w);
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

function parseOverlayStrength(overlay) {
  const raw = String(overlay || '').trim();
  const m = raw.match(/rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/i);
  return m ? Number(m[1]) : 0;
}

function readCssVar(name) {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function isCssBgImageActive() {
  const bg = readCssVar('--bg-image');
  return !!bg && bg !== 'none';
}

/** Điều chỉnh độ đậm cột theo nền trang / hình nền theme. */
export function buildKanbanContrastProfile(theme) {
  const pageBg = theme?.pageBg || readCssVar('--color-page-bg') || '#f0f2f5';
  const pageRgb = parseRgb(pageBg) || [240, 242, 245];
  const pageLum = relativeLuminance(...pageRgb);
  const hasBgImage = !!(theme?.bgImage || theme?.bgPreset) || isCssBgImageActive();
  const overlayAlpha = parseOverlayStrength(theme?.bgOverlay);

  let boost = 0;
  if (hasBgImage) boost += 0.14;
  if (pageLum < 0.55) boost += (0.55 - pageLum) * 0.35;
  if (overlayAlpha > 0.08) boost += overlayAlpha * 0.22;

  return {
    pageLum,
    headerMix: clampMix(0.5 - boost),
    bodyMix: clampMix(0.8 - boost * 0.65),
    columnMix: clampMix(0.74 - boost * 0.75),
    borderMix: clampMix(0.26 - boost * 0.45),
    dropMix: clampMix(0.38 - boost * 0.9),
  };
}

function clampMix(v) {
  return Math.max(0.14, Math.min(0.88, v));
}

function ensureHeaderContrast(accent, headerMix, pageLum, minRatio = 1.32) {
  let mix = headerMix;
  for (let i = 0; i < 10; i += 1) {
    const headerHex = mixKanbanWithWhite(accent, mix);
    const headerLum = relativeLuminance(...(parseRgb(headerHex) || [255, 255, 255]));
    if (contrastRatio(headerLum, pageLum) >= minRatio) return mix;
    mix = Math.max(0.12, mix - 0.05);
  }
  return mix;
}

function buildThemeFromAccent(accent, theme) {
  const profile = buildKanbanContrastProfile(theme);
  const headerMix = ensureHeaderContrast(accent, profile.headerMix, profile.pageLum);

  return {
    accent,
    columnIndexColor: accent,
    columnBg: mixKanbanWithWhite(accent, profile.columnMix),
    headerBg: mixKanbanWithWhite(accent, headerMix),
    bodyBg: mixKanbanWithWhite(accent, profile.bodyMix),
    dropBg: mixKanbanWithWhite(accent, profile.dropMix),
    border: mixKanbanWithWhite(accent, profile.borderMix),
    badgeBg: mixKanbanWithWhite(accent, Math.min(0.9, headerMix + 0.12)),
    badgeBorder: mixKanbanWithWhite(accent, Math.max(0.1, profile.borderMix - 0.06)),
    headerShadow: profile.pageLum < 0.5 || isCssBgImageActive()
      ? 'inset 0 1px 0 rgba(255,255,255,0.45), 0 1px 2px rgba(15,23,42,0.12)'
      : 'inset 0 1px 0 rgba(255,255,255,0.55)',
  };
}

/** @param {number} [columnIndex] @param {object} [theme] */
export function getKanbanColumnTheme(columnIndex = 0, theme) {
  return buildThemeFromAccent(getKanbanColumnAccent(columnIndex), theme);
}

/** Tham số stageColor (nếu có) bị bỏ qua — chỉ dùng columnIndex. */
export function useKanbanColumnTheme(columnIndexOrStageColor, columnIndex = 0) {
  const ctx = useTheme();
  const theme = ctx?.theme;
  const resolvedIndex = typeof columnIndexOrStageColor === 'number' && columnIndex === 0
    ? columnIndexOrStageColor
    : columnIndex;

  return useMemo(
    () => getKanbanColumnTheme(resolvedIndex, theme),
    [
      resolvedIndex,
      theme?.pageBg,
      theme?.bgImage,
      theme?.bgPreset,
      theme?.bgOverlay,
    ],
  );
}

/** Badge count nhỏ — rgba trên nền đặc. */
export function kanbanColumnRgba(color, alpha = 0.08) {
  const rgb = parseRgb(color);
  if (!rgb) return `rgba(148, 163, 184, ${alpha})`;
  const [r, g, b] = rgb;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
