/**
 * Tight red highlight around real clickable targets.
 * Prefer oval/pill matching element box — NOT max(w,h) circles.
 */
window.__guideClear = function () {
  document.querySelectorAll('[data-guide-ring],[data-guide-callout]').forEach((n) => n.remove());
};

window.__guideMarkTight = function (el, label, opts = {}) {
  if (!el) return false;
  const pad = opts.pad != null ? opts.pad : 5;
  const scroll = opts.scroll !== false;
  if (scroll) el.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;

  const ring = document.createElement('div');
  ring.setAttribute('data-guide-ring', '1');
  const w = r.width + pad * 2;
  const h = r.height + pad * 2;
  // pill/oval theo đúng khung nút — không phình thành hình tròn max(w,h)
  const radius = Math.min(w, h) / 2 + 2;
  Object.assign(ring.style, {
    position: 'fixed',
    left: `${r.left - pad}px`,
    top: `${r.top - pad}px`,
    width: `${w}px`,
    height: `${h}px`,
    border: '3px solid #ef4444',
    borderRadius: `${radius}px`,
    boxShadow: '0 0 0 2px rgba(239,68,68,.28)',
    pointerEvents: 'none',
    zIndex: '2147483646',
    background: 'transparent',
  });
  document.body.appendChild(ring);

  if (label) {
    const c = document.createElement('div');
    c.setAttribute('data-guide-callout', '1');
    c.textContent = label;
    const preferAbove = r.top > 40;
    Object.assign(c.style, {
      position: 'fixed',
      left: `${Math.min(window.innerWidth - 160, Math.max(8, r.left))}px`,
      top: preferAbove ? `${r.top - 26}px` : `${r.bottom + 6}px`,
      background: '#ef4444',
      color: '#fff',
      fontSize: '11px',
      fontWeight: '700',
      padding: '3px 7px',
      borderRadius: '5px',
      zIndex: '2147483647',
      pointerEvents: 'none',
      fontFamily: 'Segoe UI, sans-serif',
      whiteSpace: 'nowrap',
      boxShadow: '0 1px 4px rgba(0,0,0,.25)',
    });
    document.body.appendChild(c);
  }
  return true;
};

window.__guideFindBtn = function (re, maxLen = 60) {
  return [...document.querySelectorAll('button, a, [role="button"]')].find((b) => {
    const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
    return re.test(t) && t.length <= maxLen;
  });
};

window.__guideFindText = function (re, maxLen = 80) {
  let hit = null;
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walk.nextNode())) {
    const v = (n.nodeValue || '').trim();
    if (re.test(v) && v.length <= maxLen) {
      hit = n.parentElement;
      break;
    }
  }
  return hit;
};
