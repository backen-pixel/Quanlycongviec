import { useId } from 'react';

/**
 * Minh họa SVG 2D / 3D theo họ — thumbnail gallery.
 * lid_base = Rigid box with lid (2 khay thập + nắp nâng 3D).
 * tuck_end = carton có dust flap + tuck flap.
 * Trim xanh dương · Crease đỏ.
 */

export function DielineThumb({ family, className = '' }) {
  const common = 'w-full h-full';
  switch (family) {
    case 'double_door':
      return (
        <svg viewBox="0 0 120 90" className={`${common} ${className}`} aria-hidden>
          <rect x="8" y="28" width="40" height="34" fill="#fff7ed" stroke="#2563eb" strokeWidth="1.2" />
          <line x1="18" y1="28" x2="18" y2="62" stroke="#dc2626" strokeWidth="0.8" strokeDasharray="2 1.5" />
          <line x1="38" y1="28" x2="38" y2="62" stroke="#dc2626" strokeWidth="0.8" strokeDasharray="2 1.5" />
          <rect x="52" y="20" width="28" height="50" fill="#fff7ed" stroke="#2563eb" strokeWidth="1.2" />
          <line x1="66" y1="20" x2="66" y2="70" stroke="#dc2626" strokeWidth="0.9" strokeDasharray="2 1.5" />
          <path d="M84 28 h22 v34 h-22" fill="#fff7ed" stroke="#2563eb" strokeWidth="1.1" />
          <rect x="52" y="74" width="28" height="8" fill="#fff7ed" stroke="#2563eb" strokeWidth="1" />
        </svg>
      );
    case 'drawer':
    case 'sleeve_drawer':
      return (
        <svg viewBox="0 0 120 90" className={`${common} ${className}`} aria-hidden>
          <rect x="20" y="30" width="70" height="28" fill="#fff7ed" stroke="#2563eb" strokeWidth="1.2" />
          <line x1="38" y1="30" x2="38" y2="58" stroke="#dc2626" strokeDasharray="2 1.5" strokeWidth="0.8" />
          <line x1="72" y1="30" x2="72" y2="58" stroke="#dc2626" strokeDasharray="2 1.5" strokeWidth="0.8" />
          <rect x="28" y="62" width="54" height="16" fill="#fff7ed" stroke="#2563eb" strokeWidth="1.1" />
          <line x1="28" y1="70" x2="82" y2="70" stroke="#dc2626" strokeDasharray="2 1.5" strokeWidth="0.8" />
        </svg>
      );
    case 'book':
      return (
        <svg viewBox="0 0 120 90" className={`${common} ${className}`} aria-hidden>
          <rect x="10" y="25" width="100" height="40" fill="#fff7ed" stroke="#2563eb" strokeWidth="1.2" />
          <line x1="45" y1="25" x2="45" y2="65" stroke="#dc2626" strokeDasharray="2 1.5" strokeWidth="0.9" />
          <line x1="55" y1="25" x2="55" y2="65" stroke="#dc2626" strokeDasharray="2 1.5" strokeWidth="0.9" />
          <rect x="35" y="68" width="50" height="14" fill="#fff7ed" stroke="#2563eb" strokeWidth="1" />
        </svg>
      );
    case 'flip_top':
    case 'magnetic':
      return (
        <svg viewBox="0 0 120 90" className={`${common} ${className}`} aria-hidden>
          <path d="M30 20 h60 v18 h-60 z" fill="#fff7ed" stroke="#2563eb" strokeWidth="1.2" />
          <path d="M20 38 h80 v32 h-80 z" fill="#fff7ed" stroke="#2563eb" strokeWidth="1.2" />
          <line x1="30" y1="38" x2="90" y2="38" stroke="#dc2626" strokeDasharray="2 1.5" strokeWidth="0.9" />
          <line x1="40" y1="20" x2="40" y2="38" stroke="#dc2626" strokeDasharray="2 1.5" strokeWidth="0.7" />
          <line x1="80" y1="20" x2="80" y2="38" stroke="#dc2626" strokeDasharray="2 1.5" strokeWidth="0.7" />
        </svg>
      );
    case 'tall_bottle':
      return (
        <svg viewBox="0 0 120 90" className={`${common} ${className}`} aria-hidden>
          <rect x="42" y="8" width="36" height="14" fill="#fff7ed" stroke="#2563eb" strokeWidth="1.1" />
          <path d="M35 22 h50 v12 h12 v40 h-74 v-40 h12 z" fill="#fff7ed" stroke="#2563eb" strokeWidth="1.2" />
          <line x1="35" y1="34" x2="85" y2="34" stroke="#dc2626" strokeDasharray="2 1.5" strokeWidth="0.8" />
        </svg>
      );
    case 'tuck_end':
      return (
        <svg viewBox="0 0 140 110" className={`${common} ${className}`} aria-hidden>
          <path d="M48 8 L92 8 L96 14 L96 28 L44 28 L44 14 Z" fill="#fff7ed" stroke="#2563eb" strokeWidth="1.1" />
          <line x1="48" y1="28" x2="92" y2="28" stroke="#dc2626" strokeWidth="0.9" strokeDasharray="2 1.2" />
          <path d="M28 28 L44 28 L44 52 L30 48 L30 32 Z" fill="#fff7ed" stroke="#2563eb" strokeWidth="1.1" />
          <path d="M96 28 L112 28 L110 32 L110 48 L96 52 Z" fill="#fff7ed" stroke="#2563eb" strokeWidth="1.1" />
          <line x1="44" y1="28" x2="44" y2="52" stroke="#dc2626" strokeWidth="0.85" strokeDasharray="2 1.2" />
          <line x1="96" y1="28" x2="96" y2="52" stroke="#dc2626" strokeWidth="0.85" strokeDasharray="2 1.2" />
          <rect x="44" y="28" width="52" height="24" fill="#fff7ed" stroke="#2563eb" strokeWidth="1.1" />
          <line x1="44" y1="52" x2="96" y2="52" stroke="#dc2626" strokeWidth="0.9" strokeDasharray="2 1.2" />
          <rect x="20" y="52" width="100" height="28" fill="#fff7ed" stroke="#2563eb" strokeWidth="1.1" />
          <line x1="44" y1="52" x2="44" y2="80" stroke="#dc2626" strokeWidth="0.85" strokeDasharray="2 1.2" />
          <line x1="70" y1="52" x2="70" y2="80" stroke="#dc2626" strokeWidth="0.85" strokeDasharray="2 1.2" />
          <line x1="96" y1="52" x2="96" y2="80" stroke="#dc2626" strokeWidth="0.85" strokeDasharray="2 1.2" />
          <rect x="70" y="80" width="26" height="16" fill="#fff7ed" stroke="#2563eb" strokeWidth="1.1" />
          <path d="M74 96 L92 96 L94 100 L94 108 L72 108 L72 100 Z" fill="#fff7ed" stroke="#2563eb" strokeWidth="1.1" />
          <line x1="70" y1="96" x2="96" y2="96" stroke="#dc2626" strokeWidth="0.85" strokeDasharray="2 1.2" />
        </svg>
      );
    case 'lid_base':
    case 'shoulder':
      // Rigid box with lid — 2 khay thập (base + lid), khớp tên thẻ
      return (
        <svg viewBox="0 0 140 100" className={`${common} ${className}`} aria-hidden>
          <path
            d="M22 36 H44 V18 H76 V36 H98 V64 H76 V82 H44 V64 H22 Z"
            fill="#fff7ed"
            stroke="#2563eb"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <line x1="44" y1="36" x2="76" y2="36" stroke="#dc2626" strokeWidth="1" strokeDasharray="2.2 1.3" />
          <line x1="44" y1="64" x2="76" y2="64" stroke="#dc2626" strokeWidth="1" strokeDasharray="2.2 1.3" />
          <line x1="44" y1="36" x2="44" y2="64" stroke="#dc2626" strokeWidth="1" strokeDasharray="2.2 1.3" />
          <line x1="76" y1="36" x2="76" y2="64" stroke="#dc2626" strokeWidth="1" strokeDasharray="2.2 1.3" />
          <text x="60" y="53" textAnchor="middle" fontSize="6" fill="#64748b">
            base
          </text>
          <path
            d="M108 40 H118 V28 H132 V40 H142 V60 H132 V72 H118 V60 H108 Z"
            fill="#fff7ed"
            stroke="#2563eb"
            strokeWidth="1.1"
            strokeLinejoin="round"
            transform="translate(-6,0)"
          />
          <g transform="translate(-6,0)">
            <line x1="118" y1="40" x2="132" y2="40" stroke="#dc2626" strokeWidth="0.85" strokeDasharray="2 1.2" />
            <line x1="118" y1="60" x2="132" y2="60" stroke="#dc2626" strokeWidth="0.85" strokeDasharray="2 1.2" />
            <line x1="118" y1="40" x2="118" y2="60" stroke="#dc2626" strokeWidth="0.85" strokeDasharray="2 1.2" />
            <line x1="132" y1="40" x2="132" y2="60" stroke="#dc2626" strokeWidth="0.85" strokeDasharray="2 1.2" />
            <text x="125" y="53" textAnchor="middle" fontSize="5" fill="#64748b">
              lid
            </text>
          </g>
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 140 100" className={`${common} ${className}`} aria-hidden>
          <path
            d="M22 36 H44 V18 H76 V36 H98 V64 H76 V82 H44 V64 H22 Z"
            fill="#fff7ed"
            stroke="#2563eb"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <line x1="44" y1="36" x2="76" y2="36" stroke="#dc2626" strokeWidth="1" strokeDasharray="2.2 1.3" />
          <line x1="44" y1="64" x2="76" y2="64" stroke="#dc2626" strokeWidth="1" strokeDasharray="2.2 1.3" />
          <line x1="44" y1="36" x2="44" y2="64" stroke="#dc2626" strokeWidth="1" strokeDasharray="2.2 1.3" />
          <line x1="76" y1="36" x2="76" y2="64" stroke="#dc2626" strokeWidth="1" strokeDasharray="2.2 1.3" />
        </svg>
      );
  }
}

export function Mock3dThumb({ family, className = '' }) {
  const uid = useId().replace(/:/g, '');
  const common = 'w-full h-full';
  const fill = '#f8fafc';
  const edge = '#94a3b8';
  const shade = '#e2e8f0';
  const inner = '#d6d3d1';

  if (family === 'double_door') {
    return (
      <svg viewBox="0 0 120 100" className={`${common} ${className}`} aria-hidden>
        <ellipse cx="60" cy="88" rx="38" ry="6" fill="#e5e7eb" opacity="0.7" />
        <path d="M28 58 L60 70 L92 58 L60 46 Z" fill={shade} stroke={edge} strokeWidth="0.8" />
        <path d="M28 40 L28 58 L60 70 L60 52 Z" fill={fill} stroke={edge} strokeWidth="0.8" />
        <path d="M92 40 L92 58 L60 70 L60 52 Z" fill={shade} stroke={edge} strokeWidth="0.8" />
        <path d="M28 40 L12 28 L44 16 L60 28 Z" fill={fill} stroke={edge} strokeWidth="0.8" />
        <path d="M92 40 L108 28 L76 16 L60 28 Z" fill={fill} stroke={edge} strokeWidth="0.8" />
      </svg>
    );
  }

  if (family === 'drawer' || family === 'sleeve_drawer') {
    return (
      <svg viewBox="0 0 120 100" className={`${common} ${className}`} aria-hidden>
        <ellipse cx="60" cy="88" rx="36" ry="5" fill="#e5e7eb" opacity="0.7" />
        <path d="M30 48 L58 60 L86 48 L58 36 Z" fill={shade} stroke={edge} />
        <path d="M30 36 L30 48 L58 60 L58 48 Z" fill={fill} stroke={edge} />
        <path d="M86 36 L86 48 L58 60 L58 48 Z" fill={shade} stroke={edge} />
        <path d="M40 42 L68 54 L96 42 L68 30 Z" fill={fill} stroke={edge} />
        <path d="M40 32 L40 42 L68 54 L68 44 Z" fill={fill} stroke={edge} />
      </svg>
    );
  }

  if (family === 'book') {
    return (
      <svg viewBox="0 0 120 100" className={`${common} ${className}`} aria-hidden>
        <ellipse cx="60" cy="88" rx="36" ry="5" fill="#e5e7eb" opacity="0.7" />
        <path d="M35 55 L70 68 L95 52 L60 40 Z" fill={shade} stroke={edge} />
        <path d="M35 38 L35 55 L70 68 L70 50 Z" fill={fill} stroke={edge} />
        <path d="M35 38 L22 30 L57 18 L70 28 Z" fill={fill} stroke={edge} />
      </svg>
    );
  }

  if (family === 'flip_top' || family === 'magnetic') {
    return (
      <svg viewBox="0 0 120 100" className={`${common} ${className}`} aria-hidden>
        <ellipse cx="60" cy="88" rx="36" ry="5" fill="#e5e7eb" opacity="0.7" />
        <path d="M32 58 L60 70 L88 58 L60 46 Z" fill={shade} stroke={edge} />
        <path d="M32 42 L32 58 L60 70 L60 54 Z" fill={fill} stroke={edge} />
        <path d="M88 42 L88 58 L60 70 L60 54 Z" fill={shade} stroke={edge} />
        <path d="M32 42 L18 28 L46 16 L60 30 Z" fill={fill} stroke={edge} />
      </svg>
    );
  }

  if (family === 'tall_bottle') {
    return (
      <svg viewBox="0 0 120 100" className={`${common} ${className}`} aria-hidden>
        <ellipse cx="60" cy="90" rx="22" ry="4" fill="#e5e7eb" opacity="0.7" />
        <path d="M48 78 L60 84 L72 78 L60 72 Z" fill={shade} stroke={edge} />
        <path d="M48 28 L48 78 L60 84 L60 34 Z" fill={fill} stroke={edge} />
        <path d="M72 28 L72 78 L60 84 L60 34 Z" fill={shade} stroke={edge} />
        <path d="M48 28 L60 22 L72 28 L60 34 Z" fill={fill} stroke={edge} />
      </svg>
    );
  }

  if (family === 'tuck_end') {
    return (
      <svg viewBox="0 0 120 100" className={`${common} ${className}`} aria-hidden>
        <ellipse cx="60" cy="88" rx="34" ry="5" fill="#e5e7eb" opacity="0.7" />
        <path d="M34 58 L60 70 L86 58 L60 46 Z" fill={shade} stroke={edge} />
        <path d="M34 40 L34 58 L60 70 L60 52 Z" fill={fill} stroke={edge} />
        <path d="M86 40 L86 58 L60 70 L60 52 Z" fill={shade} stroke={edge} />
        <path d="M34 40 L20 22 L46 10 L60 28 Z" fill={fill} stroke={edge} />
        <path d="M46 10 L52 6 L56 10 L50 14 Z" fill={inner} stroke={edge} strokeWidth="0.6" />
      </svg>
    );
  }

  // lid_base / shoulder — mockup kiểu Pacdora: hộp quà trắng, nắp nâng lệch, bóng mềm
  const gLidTop = `lidTop-${uid}`;
  const gLidSide = `lidSide-${uid}`;
  const gBaseSide = `baseSide-${uid}`;
  const fShadow = `softShadow-${uid}`;

  return (
    <svg viewBox="0 0 120 100" className={`${common} ${className}`} aria-hidden>
      <defs>
        <linearGradient id={gLidTop} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f1f5f9" />
        </linearGradient>
        <linearGradient id={gLidSide} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <linearGradient id={gBaseSide} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
        <filter id={fShadow} x="-20%" y="-10%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.6" floodColor="#94a3b8" floodOpacity="0.45" />
        </filter>
      </defs>
      <ellipse cx="60" cy="91" rx="42" ry="5.5" fill="#d1d5db" opacity="0.55" />

      <g filter={`url(#${fShadow})`}>
        <path d="M26 68 L60 82 L94 68 L60 54 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.7" />
        <path d="M26 52 L26 68 L60 82 L60 66 Z" fill={`url(#${gBaseSide})`} stroke="#94a3b8" strokeWidth="0.7" />
        <path d="M94 52 L94 68 L60 82 L60 66 Z" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.7" />
        <path d="M26 52 L60 66 L94 52 L60 38 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.75" />
        <path d="M34 54 L60 64 L86 54 L60 44 Z" fill="#c4b5a5" stroke="#a8a29e" strokeWidth="0.4" opacity="0.9" />
        <path d="M36 55 L60 52 L84 55 L60 62 Z" fill="#b45309" opacity="0.12" />
      </g>

      <g transform="translate(4,-18) rotate(-8 60 40)" filter={`url(#${fShadow})`}>
        <path d="M24 48 L60 62 L96 48 L60 34 Z" fill="#d6d3d1" stroke="#a8a29e" strokeWidth="0.55" />
        <path d="M24 36 L24 48 L60 62 L60 50 Z" fill={`url(#${gLidSide})`} stroke="#94a3b8" strokeWidth="0.7" />
        <path d="M96 36 L96 48 L60 62 L60 50 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.7" />
        <path d="M24 36 L60 22 L96 36 L60 50 Z" fill={`url(#${gLidTop})`} stroke="#94a3b8" strokeWidth="0.8" />
        <path d="M30 37 L60 26 L90 37" fill="none" stroke="#ffffff" strokeWidth="1.2" opacity="0.7" />
      </g>
    </svg>
  );
}
