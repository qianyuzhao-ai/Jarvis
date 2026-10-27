import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';

function contentSecurityPolicy(): Plugin {
  let development = false;

  return {
    name: 'jarvis-content-security-policy',
    configResolved(config) {
      development = config.command === 'serve';
    },
    transformIndexHtml() {
      const policy = [
        "default-src 'none'",
        development ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: jarvis-media: jarvis-writing: http: https:",
        "media-src 'self' blob: jarvis-media: jarvis-writing: http: https:",
        "font-src 'self'",
        development ? "connect-src 'self' ws://127.0.0.1:5173" : "connect-src 'none'",
        "object-src 'none'",
        'frame-src jarvis-writing:',
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; ');

      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  main: {
    build: {
      emptyOutDir: false,
      lib: { formats: ['es'], fileName: () => 'index.js' },
    },
  },
  preload: {
    build: {
      emptyOutDir: false,
      lib: { formats: ['cjs'], fileName: () => 'index.cjs' },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss(), contentSecurityPolicy()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    },
    build: { emptyOutDir: false },
  },
});
