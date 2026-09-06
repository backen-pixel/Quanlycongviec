import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import http from 'node:http'
import https from 'node:https'

/** Node mặc định maxHeaderSize=16KB → Vite trả 431 khi Cookie/Authorization + URL dài. */
const MAX_HEADER_SIZE = 1024 * 1024
function patchHttpCreateServer(mod) {
  const orig = mod.createServer
  mod.createServer = function patchedCreateServer(...args) {
    if (typeof args[0] === 'function') {
      return orig.call(this, { maxHeaderSize: MAX_HEADER_SIZE }, args[0])
    }
    if (args[0] && typeof args[0] === 'object' && typeof args[0].listen !== 'function') {
      args[0] = { ...args[0], maxHeaderSize: MAX_HEADER_SIZE }
    }
    return orig.apply(this, args)
  }
}
patchHttpCreateServer(http)
patchHttpCreateServer(https)

const BUILD_VERSION = String(Date.now());

const analyze = process.env.ANALYZE === '1';
const founderLocalBuild = process.env.VITE_FOUNDER_LOCAL_READ_ONLY === '1';
const plugins = [react(), tailwindcss()];

const FOUNDER_LOCAL_DIST_MANIFEST = Object.freeze({
  contract_version: 'business_ai_os_founder_local_dist_v1',
  runtime_profile: 'founder-local-read-only',
  read_only: true,
  entry_path: '/business-os/login',
  api_base_url: '/api',
  api_origin_policy: 'same-origin-only',
  credential_request_policy: 'single-slash-relative-api-path-only',
});

if (founderLocalBuild) {
  plugins.push({
    name: 'founder-local-dist-contract',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        // Founder-local must remain usable without contacting any external
        // origin. Remove optional web-font resources and use CSS fallbacks.
        const sameOriginHtml = html
          .replace(/<noscript>\s*<link\b[^>]*\bhref=["']https?:\/\/[^>]*>\s*<\/noscript>\s*/gi, '')
          .replace(/<link\b[^>]*\bhref=["']https?:\/\/[^>]*>\s*/gi, '');
        return {
          html: sameOriginHtml,
          tags: [
            {
              tag: 'meta',
              attrs: { name: 'business-ai-os-runtime-profile', content: FOUNDER_LOCAL_DIST_MANIFEST.runtime_profile },
              injectTo: 'head',
            },
            {
              tag: 'meta',
              attrs: { name: 'business-ai-os-api-base', content: FOUNDER_LOCAL_DIST_MANIFEST.api_base_url },
              injectTo: 'head',
            },
          ],
        };
      },
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'founder-local-manifest.json',
        source: `${JSON.stringify(FOUNDER_LOCAL_DIST_MANIFEST, null, 2)}\n`,
      });
    },
  });
}

/**
 * Sinh `dist/version.json` lúc build để frontend poll phát hiện phiên bản mới
 * (bypass cache HTML/JS ở trình duyệt cũ).
 */
plugins.push({
  name: 'emit-version-json',
  apply: 'build',
  closeBundle() {
    try {
      const outDir = resolve(__dirname, 'dist');
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        resolve(outDir, 'version.json'),
        JSON.stringify({ version: BUILD_VERSION, builtAt: new Date().toISOString() }, null, 2),
        'utf8',
      );
    } catch (e) {
      console.warn('[vite] emit-version-json:', e?.message);
    }
  },
});
if (analyze) {
  const { visualizer } = await import('rollup-plugin-visualizer');
  plugins.push(visualizer({
    filename: 'dist/bundle-stats.html',
    template: 'treemap',
    gzipSize: true,
    brotliSize: true,
    open: false,
  }));
}

export default defineConfig({
  plugins,
  define: {
    __APP_VERSION__: JSON.stringify(BUILD_VERSION),
    __FOUNDER_LOCAL_BUILD__: JSON.stringify(founderLocalBuild),
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: true,
    watch: {
      // Xuất PDF hướng dẫn ghi public/guides + scripts → Vite full-reload làm vỡ AuthContext
      ignored: ['**/public/guides/**', '**/scripts/**'],
    },
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:4000',
        ws: true,
        changeOrigin: true,
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
      '/api': {
        target: 'http://127.0.0.1:4000',
        // Giám sát Supabase probe storage ~15–25s — tránh proxy cắt sớm
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
      '/uploads': {
        target: 'http://127.0.0.1:4000',
        bypass(req) {
          // Ảnh tĩnh release-notes nằm trong frontend/public — không proxy sang backend
          if (req.url?.startsWith('/uploads/release-notes/')) return req.url;
        },
      },
    },
  },
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('xlsx')) return 'vendor-xlsx';
          if (id.includes('exceljs')) return 'vendor-exceljs';
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
          if (id.includes('/three') || id.includes('node_modules/three')) return 'vendor-three';
          if (id.includes('socket.io-client')) return 'vendor-socket';
          if (id.includes('leaflet')) return 'vendor-leaflet';
          if (id.includes('@hello-pangea/dnd') || id.includes('@dnd-kit')) return 'vendor-dnd';
          return undefined;
        },
      },
    },
  },
})
