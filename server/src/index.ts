import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

// .env.local 우선, .env 폴백
dotenv.config({ path: path.join(serverRoot, '.env.local') });
dotenv.config({ path: path.join(serverRoot, '.env') });
import fs from 'fs/promises';
import express from 'express';
import { createCorsMiddleware } from './middleware/cors.js';
import healthRouter from './routes/health.js';
import odcloudRouter from './routes/odcloud.js';
import dataGoKrRouter from './routes/dataGoKr.js';
import dartRouter from './routes/dart.js';
import geminiRouter from './routes/gemini.js';
import vaultRouter from './routes/vault.js';
import { ensureVaultStructure, getVaultRoot } from './services/vaultFileService.js';

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

    // config.json에서 API 키 로드 (env var 미설정 시 fallback)
    try {
      const configPath = path.join(getVaultRoot(), 'config.json');
      const raw = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(raw);
      if (!process.env.GEMINI_API_KEY && config.geminiApiKey) {
        process.env.GEMINI_API_KEY = config.geminiApiKey;
        console.log('Loaded GEMINI_API_KEY from vault config');
      }
      if (!process.env.DART_API_KEY && config.dartApiKey) {
        process.env.DART_API_KEY = config.dartApiKey;
        console.log('Loaded DART_API_KEY from vault config');
      }
      if (!process.env.DATA_GO_KR_API_KEY && config.dataGoKrApiKey) {
        process.env.DATA_GO_KR_API_KEY = config.dataGoKrApiKey;
        console.log('Loaded DATA_GO_KR_API_KEY from vault config');
      }
    } catch { /* config.json 없으면 스킵 */ }

    // 4시간 자동 동기화
    const AUTO_SYNC_INTERVAL = 4 * 60 * 60 * 1000;
    setInterval(async () => {
      console.log('[auto-sync] 정기 동기화 시작...');
      try {
        const resp = await fetch(`http://localhost:${PORT}/api/vault/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await resp.json();
        console.log('[auto-sync] 완료:', JSON.stringify(data).substring(0, 200));
      } catch (e) {
        console.error('[auto-sync] 실패:', e);
      }
    }, AUTO_SYNC_INTERVAL);
    console.log(`Auto-sync enabled: every ${AUTO_SYNC_INTERVAL / 3600000}h`);
  } catch (err) {
    console.error('Vault structure init failed:', err);
  }
});
