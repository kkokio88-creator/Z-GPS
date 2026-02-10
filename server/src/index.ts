import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

// .env.local 우선, .env 폴백
dotenv.config({ path: path.join(serverRoot, '.env.local') });
dotenv.config({ path: path.join(serverRoot, '.env') });
import express from 'express';
import { createCorsMiddleware } from './middleware/cors.js';
import healthRouter from './routes/health.js';
import odcloudRouter from './routes/odcloud.js';
import dataGoKrRouter from './routes/dataGoKr.js';
import dartRouter from './routes/dart.js';
import geminiRouter from './routes/gemini.js';
import vaultRouter from './routes/vault.js';
import { ensureVaultStructure } from './services/vaultFileService.js';

const app = express();
const PORT = parseInt(process.env.PORT || '5001', 10);

// Middleware
app.use(createCorsMiddleware());
app.use(express.json({ limit: '50mb' }));

// Routes
app.use('/api/health', healthRouter);
app.use('/api/odcloud', odcloudRouter);
app.use('/api/data-go', dataGoKrRouter);
app.use('/api/dart', dartRouter);
app.use('/api/gemini', geminiRouter);
app.use('/api/vault', vaultRouter);

// Start
app.listen(PORT, async () => {
  console.log(`Z-GPS API Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);

  try {
    await ensureVaultStructure();
    console.log('Vault structure initialized');
  } catch (err) {
    console.error('Vault structure init failed:', err);
  }
});
