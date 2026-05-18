import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const analyze = process.env.ANALYZE === '1';
const plugins = [react(), tailwindcss()];
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
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
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
