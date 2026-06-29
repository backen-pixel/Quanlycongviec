import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BUILD_VERSION = String(Date.now());

const analyze = process.env.ANALYZE === '1';
const plugins = [react(), tailwindcss()];

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
  },
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
        changeOrigin: true,
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
      '/api': {
        target: 'http://localhost:4000',
        // Giám sát Supabase probe storage ~15–25s — tránh proxy cắt sớm
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
      '/uploads': {
        target: 'http://localhost:4000',
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
          // Chỉ tách các gói rất nặng; phần còn lại để Vite gom — tránh vòng vendor ↔ vendor-react (gây màn trắng prod).
          if (id.includes('xlsx')) return 'vendor-xlsx';
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
          return undefined;
        },
      },
    },
  },
})
