import { Request, Response, NextFunction } from 'express';

/**
 * API 인증 미들웨어
 * - x-api-token 헤더로 인증
 * - API_ACCESS_TOKEN 환경변수 미설정 시 인증 스킵 (개발 편의)
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const requiredToken = process.env.API_ACCESS_TOKEN;

  // 환경변수 미설정 시 개발 모드로 인증 스킵
  if (!requiredToken) {
    next();
    return;
  }

  const providedToken = req.headers['x-api-token'];

  if (!providedToken || providedToken !== requiredToken) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid x-api-token header is required',
    });
    return;
  }

  next();
};
