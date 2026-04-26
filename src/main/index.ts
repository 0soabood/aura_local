/**
 * AURA_LOCAL_SYNC Main Process
 *
 * In a true Electron environment, this handles app lifecycle and window creation.
 * In this preview environment, it serves the Vite app + provides the API.
 *
 * Routes are defined in ./app.ts so they can be exercised in isolation by
 * Supertest without booting Vite or binding a port.
 */

// dotenv MUST be the first import so process.env is populated before any
// provider module captures it at class-instantiation time.
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
console.log('[ENV] GROQ_API_KEY present:', !!process.env.GROQ_API_KEY);

import { createServer as createViteServer } from 'vite';
import path from 'path';
import { schema } from '../db/index';
import { createApiApp } from './app';
import { initializeAuraMemory, startMemoryWatcher } from '../lib/memory/loader';

async function bootstrap() {
  const PORT = 3000;

  // 1. Database Migrations
  schema.up();
  console.log('AURA DB initialized');

  // 2. Memory — load into cache at boot; getAuraMemory() is called per-request by orchestrators.
  initializeAuraMemory();
  startMemoryWatcher(); // no-op unless AURA_MEMORY_WATCH=true

  // 3. API routes (factored out so tests can mount this without Vite)
  const app = createApiApp();

  // 4. Renderer Integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const express = (await import('express')).default;
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AURA MAIN] Process running at http://localhost:${PORT}`);
  });
}

bootstrap().catch(err => {
  console.error('[AURA MAIN] Failed to start:', err);
  process.exit(1);
});
