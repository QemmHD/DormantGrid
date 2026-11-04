import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { existsSync, mkdirSync, copyFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Tier B models: serve assets/manifest.json + assets/processed/** under <base>models/
 * in dev, and copy them into dist/models/ on build. GLBs are runtime-cached by the
 * service worker (not precached) so they never add to the initial download.
 */
function dgModels(): Plugin {
  const root = process.env.DG_ASSETS_ROOT ? path.resolve(process.env.DG_ASSETS_ROOT) : fileURLToPath(new URL('../../assets', import.meta.url));
  const MODEL_DIRS = ['props', 'characters', 'buildings', 'building-pieces'];
  let outDir = 'dist';
  return {
    name: 'dg-models',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        const i = url.indexOf('/models/');
        if (i < 0) return next();
        const rel = decodeURIComponent(url.slice(i + '/models/'.length));
        const file = path.resolve(root, rel);
        if (!file.startsWith(root + path.sep) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('content-type', file.endsWith('.json') ? 'application/json' : 'model/gltf-binary');
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      const dest = path.join(outDir, 'models');
      mkdirSync(dest, { recursive: true });
      const manifest = path.join(root, 'manifest.json');
      if (existsSync(manifest)) copyFileSync(manifest, path.join(dest, 'manifest.json'));
      for (const d of MODEL_DIRS) {
        const src = path.join(root, 'processed', d);
        if (!existsSync(src)) continue;
        mkdirSync(path.join(dest, 'processed', d), { recursive: true });
        for (const f of readdirSync(src)) if (f.endsWith('.glb')) copyFileSync(path.join(src, f), path.join(dest, 'processed', d, f));
      }
    },
  };
}

const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // GLB loading is lazy (only when Tier B models exist): keep it out of the eager three chunk
          if (id.includes('node_modules/three/examples/jsm/loaders') || id.includes('node_modules/three/examples/jsm/libs/meshopt')) return undefined;
          if (id.includes('node_modules/three')) return 'three';
          return undefined;
        },
      },
    },
  },
  worker: { format: 'es' },
  server: { host: true },
  plugins: [
    dgModels(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png'],
      manifest: {
        id: base,
        name: 'DORMANT GRID',
        short_name: 'Dormant Grid',
        description: 'Reboot a dead city one district at a time.',
        start_url: base,
        scope: base,
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#0d1014',
        theme_color: '#0d1014',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webp,svg,json,wasm,m4a,mp3}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//, /^\/ws\//],
        cleanupOutdatedCaches: true,
        // Tier B model loading is on demand: never precache the models or their loader chunks
        globIgnores: ['models/**', 'assets/GLTFLoader-*.js', 'assets/meshopt_decoder*.js'],
        runtimeCaching: [
          { urlPattern: /\/assets\/(GLTFLoader|meshopt_decoder)[^/]*\.js$/, handler: 'StaleWhileRevalidate', options: { cacheName: 'dg-model-loader' } },
          { urlPattern: /\/models\/.*\.(glb|json)$/, handler: 'StaleWhileRevalidate', options: { cacheName: 'dg-models', expiration: { maxEntries: 80 } } },
        ],
      },
    }),
  ],
});
