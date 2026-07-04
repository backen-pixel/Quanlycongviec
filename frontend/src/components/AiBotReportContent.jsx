/**
 * Render nội dung báo cáo AI bot (markdown nhẹ: *bold*, section, divider).
 */
function renderInlineBold(text) {
  const parts = String(text || '').split(/(\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <strong key={i} className="font-semibold text-gray-900">
          {part.slice(1, -1)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function isDividerLine(line) {
  return /^[━─\-]{6,}$/.test(String(line || '').trim());
}

function isSectionTitle(line) {
  const t = String(line || '').trim();
  if (/^(📊|🏬|🆕|🔁|🏆)\s+\*[^*]+\*$/.test(t)) return true;
  // Định dạng cũ: "🏬 Theo công ty", "🆕 Mới trong kỳ (top)"
  if (/^(🏬|🆕|🔁|🏆)\s+/.test(t) && !/\d/.test(t)) return true;
  return false;
}

function isMetaLine(line) {
  return /^(👤|🏢|🏷|👔|📍|🗓)\s/.test(String(line || '').trim());
}

function isMetricLine(line) {
  const t = String(line || '').trim();
  if (!t || t.startsWith('•') || isSectionTitle(t)) return false;
  if (!/^(🆕|🤝|✅|🔄|❌|📂|✓|⚠️|↳)/.test(t)) return false;
  if (/^(🏬|🆕|🔁|🏆)\s/.test(t) && !/\d/.test(t)) return false;
  return true;
}

export function isAiBotReportContent(content) {
  const t = String(content || '').trim();
  return t.startsWith('🎯') || /^[━─\-]{8,}$/m.test(t);
}

export default function AiBotReportContent({ text, className = '' }) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (isDividerLine(trimmed)) {
      blocks.push({ type: 'divider', key: `d-${i}` });
      i += 1;
      continue;
    }

    if (/^🎯/.test(trimmed)) {
      blocks.push({ type: 'title', text: trimmed, key: `t-${i}` });
      i += 1;
      continue;
    }

    if (isMetaLine(trimmed)) {
      const metaLines = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t || isDividerLine(t) || !isMetaLine(t)) break;
        metaLines.push(t);
        i += 1;
      }
      blocks.push({ type: 'meta', lines: metaLines, key: `m-${i}` });
      continue;
    }

    if (isMetricLine(trimmed) || trimmed.startsWith('   ↳') || trimmed.startsWith('↳')) {
      const metricLines = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t || isDividerLine(t) || isSectionTitle(t) || t.startsWith('•')) break;
        if (isMetricLine(t) || t.startsWith('↳') || t.startsWith('   ↳')) {
          metricLines.push(t);
          i += 1;
          continue;
        }
        break;
      }
      blocks.push({ type: 'metrics', lines: metricLines, key: `k-${i}` });
      continue;
    }

    if (isSectionTitle(trimmed)) {
      const title = trimmed;
      i += 1;
      const items = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t) {
          i += 1;
          continue;
        }
        if (isDividerLine(t) || isSectionTitle(t) || /^🎯/.test(t) || isMetaLine(t) || isMetricLine(t)) break;
        if (t.startsWith('•') || t.startsWith('…')) {
          items.push(t);
          i += 1;
          continue;
        }
        break;
      }
      blocks.push({ type: 'section', title, items, key: `s-${i}-${title}` });
      continue;
    }

    blocks.push({ type: 'line', text: trimmed, key: `l-${i}` });
    i += 1;
  }

  return (
    <div className={`space-y-2 text-[13px] leading-[1.45] ${className}`}>
      {blocks.map((block) => {
        if (block.type === 'divider') {
          return <hr key={block.key} className="border-0 border-t border-indigo-200/80 my-1" />;
        }
        if (block.type === 'title') {
          return (
            <p key={block.key} className="font-bold text-indigo-900 text-[15px] leading-snug">
              {renderInlineBold(block.text.replace(/^🎯\s*/, '🎯 '))}
            </p>
          );
        }
        if (block.type === 'meta') {
          return (
            <div key={block.key} className="rounded-xl bg-white/70 border border-indigo-100/90 px-2.5 py-2 space-y-0.5">
              {block.lines.map((l, idx) => (
                <p key={idx} className="text-gray-600 text-[12px] leading-snug">
                  {renderInlineBold(l)}
                </p>
              ))}
            </div>
          );
        }
        if (block.type === 'metrics') {
          return (
            <div key={block.key} className="rounded-xl bg-white/60 border border-indigo-100/70 px-2.5 py-2 space-y-1">
              {block.lines.map((l, idx) => (
                <p
                  key={idx}
                  className={`text-gray-800 text-[12.5px] ${l.startsWith('↳') || l.startsWith('   ↳') ? 'pl-2 text-gray-500 text-[12px]' : ''}`}
                >
                  {renderInlineBold(l.replace(/^\s*↳\s*/, '↳ '))}
                </p>
              ))}
            </div>
          );
        }
        if (block.type === 'section') {
          return (
            <div key={block.key} className="pt-1">
              <p className="font-semibold text-indigo-800 text-[12.5px] mb-1.5">
                {renderInlineBold(block.title)}
              </p>
              <div className="space-y-0.5 pl-0.5">
                {block.items.map((item, idx) => (
                  <p key={idx} className="text-gray-600 text-[12px] leading-snug">
                    {renderInlineBold(item)}
                  </p>
                ))}
              </div>
            </div>
          );
        }
        return (
          <p key={block.key} className="text-gray-700">
            {renderInlineBold(block.text)}
          </p>
        );
      })}
    </div>
  );
}
