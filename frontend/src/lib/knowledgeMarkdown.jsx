function renderInline(text, keyPrefix) {
  if (!text) return text;
  const parts = [];
  let remaining = text;
  let idx = 0;

  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/;
  while (remaining.length) {
    const m = remaining.match(pattern);
    if (!m) {
      parts.push(remaining);
      break;
    }
    if (m.index > 0) parts.push(remaining.slice(0, m.index));
    const token = m[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={`${keyPrefix}-b-${idx}`} className="font-semibold" style={{ color: '#000000' }}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(<code key={`${keyPrefix}-c-${idx}`} className="px-1.5 py-0.5 rounded bg-gray-100 text-pink-700 font-mono text-[0.85em]">{token.slice(1, -1)}</code>);
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        parts.push(
          <a key={`${keyPrefix}-l-${idx}`} href={linkMatch[2]} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
            {linkMatch[1]}
          </a>,
        );
      } else {
        parts.push(token);
      }
    }
    remaining = remaining.slice(m.index + token.length);
    idx += 1;
  }
  return parts;
}

export function renderMarkdownLines(content) {
  if (!content) return null;
  const lines = content.split('\n');
  const out = [];
  let inCode = false;
  let codeBuffer = [];
  let listBuffer = [];

  const flushList = () => {
    if (listBuffer.length) {
      out.push(
        <ul key={`ul-${out.length}`} className="list-disc ml-6 my-2 space-y-1">
          {listBuffer.map((li, i) => (
            <li key={i} className="text-[15px] leading-relaxed" style={{ color: '#1f2937' }}>{renderInline(li, `li-${out.length}-${i}`)}</li>
          ))}
        </ul>,
      );
      listBuffer = [];
    }
  };

  lines.forEach((line, i) => {
    if (line.startsWith('```')) {
      flushList();
      if (inCode) {
        out.push(
          <pre key={`code-${i}`} className="bg-gray-900 text-gray-100 rounded-lg p-3 my-3 overflow-x-auto text-xs">
            <code>{codeBuffer.join('\n')}</code>
          </pre>,
        );
        codeBuffer = [];
        inCode = false;
      } else {
        inCode = true;
      }
      return;
    }
    if (inCode) {
      codeBuffer.push(line);
      return;
    }

    if (line.startsWith('### ')) {
      flushList();
      out.push(<h4 key={i} className="text-base font-bold text-gray-900 mt-5 mb-2">{renderInline(line.slice(4), `h4-${i}`)}</h4>);
    } else if (line.startsWith('## ')) {
      flushList();
      out.push(<h3 key={i} className="text-lg font-bold mt-6 mb-2 pb-1 border-b border-gray-100" style={{ color: '#000000' }}>{renderInline(line.slice(3), `h3-${i}`)}</h3>);
    } else if (line.startsWith('# ')) {
      flushList();
      out.push(<h2 key={i} className="text-xl font-bold mt-6 mb-3" style={{ color: '#000000' }}>{renderInline(line.slice(2), `h2-${i}`)}</h2>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      listBuffer.push(line.slice(2));
    } else if (/^\d+\.\s/.test(line)) {
      flushList();
      out.push(
        <p key={i} className="text-[15px] leading-relaxed ml-4" style={{ color: '#1f2937' }}>
          <span className="text-blue-600 font-semibold mr-1">{line.match(/^(\d+\.)/)[1]}</span>
          {renderInline(line.replace(/^\d+\.\s/, ''), `ol-${i}`)}
        </p>,
      );
    } else if (line.trim() === '---') {
      flushList();
      out.push(<hr key={i} className="my-4 border-gray-200" />);
    } else if (line.trim() === '') {
      flushList();
      out.push(<div key={i} className="h-2" />);
    } else {
      flushList();
      out.push(<p key={i} className="text-[15px] leading-relaxed my-1" style={{ color: '#1f2937' }}>{renderInline(line, `p-${i}`)}</p>);
    }
  });
  flushList();
  return out;
}

export function extractToc(content) {
  if (!content) return [];
  const lines = content.split('\n');
  const toc = [];
  lines.forEach((line, i) => {
    let level = 0;
    let text = '';
    if (line.startsWith('### ')) { level = 3; text = line.slice(4); }
    else if (line.startsWith('## ')) { level = 2; text = line.slice(3); }
    else if (line.startsWith('# ')) { level = 1; text = line.slice(2); }
    if (level) toc.push({ id: `toc-${i}`, level, text, line: i });
  });
  return toc;
}

export function youtubeEmbedUrl(url, embedId) {
  const id = embedId || (url && String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=))([^?&]+)/)?.[1]);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}

export function estimateReadingTime(text) {
  if (!text) return 0;
  const words = String(text).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
