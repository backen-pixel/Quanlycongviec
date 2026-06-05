/** Render nội dung release note / builtin update (markdown nhẹ + ảnh). */

const IMG_LINE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;

/** Ảnh UI dọc (thông báo…) — khung ngang 2:1, object-contain để không cắt mất nội dung. */
function isWideReleaseImage(src) {
  return /notification|thong-bao|giao-viec/i.test(String(src || ''));
}

export function renderReleaseNoteContent(content) {
  if (!content) return null;
  return content.split('\n').map((line, i) => {
    const img = line.trim().match(IMG_LINE);
    if (img) {
      const [, alt, src] = img;
      const wide = isWideReleaseImage(src);
      return (
        <figure key={i} className="my-4">
          <div
            className={`relative w-full rounded-xl border border-gray-200 shadow-md overflow-hidden bg-gradient-to-br from-slate-100 to-slate-50 ${
              wide ? 'aspect-[2/1] min-h-[200px]' : 'aspect-video'
            }`}
          >
            <img
              src={src}
              alt={alt || 'Minh họa'}
              className={`absolute inset-0 w-full h-full ${wide ? 'object-contain p-1' : 'object-cover object-center'}`}
              loading="lazy"
            />
          </div>
          {alt ? (
            <figcaption className="text-[11px] text-gray-500 mt-2 text-center leading-snug px-1">{alt}</figcaption>
          ) : null}
        </figure>
      );
    }
    if (line.startsWith('### ')) return <h4 key={i} className="text-sm font-bold text-gray-900 mt-3 mb-1">{line.slice(4)}</h4>;
    if (line.startsWith('## ')) return <h3 key={i} className="text-base font-bold text-gray-900 mt-4 mb-1">{line.slice(3)}</h3>;
    if (line.startsWith('# ')) return <h2 key={i} className="text-lg font-bold text-gray-900 mt-4 mb-2">{line.slice(2)}</h2>;
    if (line.startsWith('- ')) return <li key={i} className="ml-4 text-sm list-disc">{line.slice(2)}</li>;
    if (line.startsWith('* ')) return <li key={i} className="ml-4 text-sm list-disc">{line.slice(2)}</li>;
    if (line.trim() === '') return <br key={i} />;
    return <p key={i} className="text-sm leading-relaxed">{line}</p>;
  });
}
