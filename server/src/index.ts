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
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createCorsMiddleware } from './middleware/cors.js';
import { authMiddleware } from './middleware/auth.js';
import healthRouter from './routes/health.js';
import odcloudRouter from './routes/odcloud.js';
import dataGoKrRouter from './routes/dataGoKr.js';
import dartRouter from './routes/dart.js';
import geminiRouter from './routes/gemini.js';
import vaultRouter from './routes/vault/index.js';
import { ensureVaultStructure, getVaultRoot } from './services/vaultFileService.js';

const app = express();
const PORT = parseInt(process.env.PORT || '5001', 10);

// 1. 보안 헤더 (최상단)
app.use(helmet());

// 2. CORS
app.use(createCorsMiddleware());

// 3. JSON 파싱
app.use(express.json({ limit: '5mb' }));

// 4. 전역 Rate Limit: 15분 / IP당 100회
const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Rate limit exceeded. Please try again later.' },
});
app.use(globalRateLimiter);

// 5. /api/health — 인증 없이 등록
app.use('/api/health', healthRouter);

// 6. auth 미들웨어 (health 이후, 나머지 라우트 이전)
app.use(authMiddleware);

// 7. Gemini 전용 Rate Limit: 1분 / IP당 20회
const geminiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Gemini rate limit exceeded. Please try again in a minute.' },
});
app.use('/api/gemini', geminiRateLimiter, geminiRouter);

// 8. 나머지 라우트
app.use('/api/odcloud', odcloudRouter);
app.use('/api/data-go', dataGoKrRouter);
app.use('/api/dart', dartRouter);
app.use('/api/vault', vaultRouter);

// Start
const server = app.listen(PORT, async () => {
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

// SSE 장시간 연결을 위해 소켓 타임아웃 20분으로 설정 (Express 기본 2분 → 20분)
server.setTimeout(20 * 60 * 1000);
