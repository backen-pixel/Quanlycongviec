/** Preload + decode PNG icon module — tránh giật khi đổi module lần đầu. */
const decodedUrls = new Set();
const pending = new Map();

export function isModuleIconDecoded(url) {
  return !url || decodedUrls.has(url);
}

export function preloadModuleIcon(url) {
  if (!url) return Promise.resolve();
  if (decodedUrls.has(url)) return Promise.resolve();
  if (pending.has(url)) return pending.get(url);

  const promise = new Promise((resolve) => {
    const img = new Image();
    const finish = () => {
      decodedUrls.add(url);
      pending.delete(url);
      resolve();
    };

    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(finish).catch(finish);
        return;
      }
      finish();
    };
    img.onerror = finish;
    img.src = url;
  });

  pending.set(url, promise);
  return promise;
}

export function preloadModuleIconsFromModules(modules) {
  const urls = [...new Set((modules || []).map((m) => m?.imageUrl).filter(Boolean))];
  return Promise.all(urls.map((url) => preloadModuleIcon(url)));
}
