/**
 * Capture annotated real UI screenshots for the VC handover guide.
 * Run while Chrome MCP has admin session, OR use this from evaluate + take_screenshot.
 * This helper is injected into the page via Chrome DevTools.
 */
window.__guideMark = function guideMark(targets) {
  document.querySelectorAll('[data-guide-ring],[data-guide-callout]').forEach((n) => n.remove());
  const mkRing = (el, label, pad = 8) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    const ring = document.createElement('div');
    ring.setAttribute('data-guide-ring', '1');
    const size = Math.max(r.width, r.height) + pad * 2 + 8;
    Object.assign(ring.style, {
      position: 'fixed',
      left: `${r.left + r.width / 2 - size / 2}px`,
      top: `${r.top + r.height / 2 - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      border: '3px solid #ef4444',
      borderRadius: '50%',
      boxShadow: '0 0 0 3px rgba(239,68,68,.22)',
      pointerEvents: 'none',
      zIndex: '2147483646',
    });
    document.body.appendChild(ring);
    if (label) {
      const c = document.createElement('div');
      c.setAttribute('data-guide-callout', '1');
      c.textContent = label;
      Object.assign(c.style, {
        position: 'fixed',
        left: `${Math.max(8, r.left)}px`,
        top: `${Math.max(8, r.top - 28)}px`,
        background: '#ef4444',
        color: '#fff',
        fontSize: '12px',
        fontWeight: '700',
        padding: '4px 8px',
        borderRadius: '6px',
        zIndex: '2147483647',
        pointerEvents: 'none',
        boxShadow: '0 2px 8px rgba(239,68,68,.35)',
        fontFamily: 'Segoe UI, sans-serif',
      });
      document.body.appendChild(c);
    }
    return r;
  };
  const findByText = (re, root = document) => {
    const nodes = [...root.querySelectorAll('button, a, [role="button"], h1, h2, h3, h4, span, div, label, td, th')];
    return nodes.find((el) => {
      const t = (el.innerText || el.textContent || '').trim();
      return re.test(t) && t.length < 120;
    });
  };
  const results = [];
  for (const t of targets) {
    let el = null;
    if (t.selector) el = document.querySelector(t.selector);
    if (!el && t.text) el = findByText(t.text instanceof RegExp ? t.text : new RegExp(t.text, 'i'));
    if (!el && t.contains) {
      el = [...document.querySelectorAll('*')].find((n) => {
        if (n.children.length > 8) return false;
        const tx = (n.innerText || '').trim();
        return tx.includes(t.contains) && tx.length < (t.maxLen || 200);
      });
    }
    if (el && t.scroll !== false) el.scrollIntoView({ block: 'center', inline: 'center' });
    results.push({ ok: !!el, label: t.label || null, text: el ? (el.innerText || '').slice(0, 60) : null });
    if (el) mkRing(el, t.label, t.pad);
  }
  return results;
};
