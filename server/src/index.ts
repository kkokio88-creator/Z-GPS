import 'dotenv/config';
import express from 'express';
import { createCorsMiddleware } from './middleware/cors.js';
import healthRouter from './routes/health.js';
import odcloudRouter from './routes/odcloud.js';
import dataGoKrRouter from './routes/dataGoKr.js';
import dartRouter from './routes/dart.js';
import geminiRouter from './routes/gemini.js';
import vaultRouter from './routes/vault.js';

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
app.listen(PORT, () => {
  console.log(`Z-GPS API Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
