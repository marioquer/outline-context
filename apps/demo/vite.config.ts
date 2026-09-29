import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Mounts server/api.ts into the dev server so Jev and Claude keys stay
 * server-side. Keys are read from .env / .env.local in the repo root or in
 * apps/demo. The static build has no server and runs fully local.
 */
function demoApi(mode: string): Plugin {
  const env = { ...loadEnv(mode, repoRoot, ''), ...loadEnv(mode, process.cwd(), '') };
  const pick = (k: string) => env[k] ?? process.env[k];
  const apiEnv = {
    AI_GATEWAY_API_KEY: pick('AI_GATEWAY_API_KEY'),
    JEV_MODEL: pick('JEV_MODEL'),
    JEV_FORCE_LOCAL: pick('JEV_FORCE_LOCAL'),
    JEV_RATE_LIMIT: pick('JEV_RATE_LIMIT'),
    ANTHROPIC_API_KEY: pick('ANTHROPIC_API_KEY'),
    DEMO_MODEL: pick('DEMO_MODEL'),
    DEMO_EFFORT: pick('DEMO_EFFORT'),
  };
  // The AI SDK's gateway provider reads the key from process.env.
  if (apiEnv.AI_GATEWAY_API_KEY) process.env.AI_GATEWAY_API_KEY = apiEnv.AI_GATEWAY_API_KEY;

  return {
    name: 'context-tree-demo-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const api = await server.ssrLoadModule('/server/api.ts');
        if (!(await api.handle(req, res, apiEnv))) next();
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), demoApi(mode)],
  base: './',
  server: { port: 5173 },
}));
