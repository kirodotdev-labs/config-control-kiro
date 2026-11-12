/**
 * @fileoverview Vite build config. The dev server proxies /api to the Go
 * backend; production assets are embedded into the Go binary from dist/.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    proxy: { '/api': { target: 'http://127.0.0.1:3030', changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // CodeMirror with its JSON, YAML and Markdown grammars is one ~570 kB chunk,
    // loaded on demand the first time an editor opens.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Vendor libraries change rarely; separate chunks keep app rebuilds small.
        codeSplitting: {
          groups: [
            { name: 'codemirror', test: /node_modules[\\/](@codemirror|@lezer|crelt|style-mod|w3c-keyname)/ },
            { name: 'mui', test: /node_modules[\\/](@mui|@emotion|@popperjs|react-transition-group)/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
});
