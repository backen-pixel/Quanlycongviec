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
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
          if (id.includes('xlsx')) return 'vendor-xlsx';
          if (id.includes('socket.io-client') || id.includes('engine.io-client')) return 'vendor-socket';
          if (id.includes('@dnd-kit') || id.includes('@hello-pangea/dnd') || id.includes('react-beautiful-dnd')) return 'vendor-dnd';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('axios')) return 'vendor-http';
          if (id.includes('react-dom') || id.match(/[\\/]react[\\/]/)) return 'vendor-react';
          return 'vendor';
        },
      },
    },
  },
})
