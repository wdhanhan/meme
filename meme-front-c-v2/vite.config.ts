import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const memeBackend = env.VITE_MEMEC_BACKEND_URL || 'http://127.0.0.1:8090';
  const apiProxy = {
    '/api': {
      target: memeBackend,
      changeOrigin: true,
    },
  };

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: true,
      port: 3001,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not change: file watching is disabled to reduce flicker during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: apiProxy,
    },
    preview: {
      proxy: apiProxy,
    },
  };
});
