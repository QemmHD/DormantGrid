import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Durable Object base class stub so DO wrappers can be exercised in Node.
    alias: { 'cloudflare:workers': fileURLToPath(new URL('./test/cf-stub.ts', import.meta.url)) },
  },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
