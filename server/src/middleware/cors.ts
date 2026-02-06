import cors from 'cors';

export const createCorsMiddleware = () => {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5000')
    .split(',')
    .map(s => s.trim());

  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    credentials: true,
  });
};
