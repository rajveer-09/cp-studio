import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
  // The WebAssembly formatters load their .wasm files themselves; pre-bundling would break those imports.
  optimizeDeps: {
    exclude: ['@wasm-fmt/clang-format', '@wasm-fmt/ruff_fmt'],
  },
  build: {
    // Monaco is large by nature; it's split into its own chunk and cached.
    chunkSizeWarningLimit: 4096,
  },
});
