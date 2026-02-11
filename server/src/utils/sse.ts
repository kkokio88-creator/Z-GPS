/**
 * SSE (Server-Sent Events) 헬퍼
 * 장시간 작업(동기화, 분석)의 실시간 진행률 전달용
 */

import { Response } from 'express';

/** SSE 응답 헤더 설정 */
export function initSSE(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx proxy buffering 비활성화
  });
  res.flushHeaders();
}

/** SSE 이벤트 전송 */
export function sendSSE(
  res: Response,
  event: string,
  data: Record<string, unknown>
): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** SSE 진행률 이벤트 전송 */
export function sendProgress(
  res: Response,
  stage: string,
  current: number,
  total: number,
  programName?: string,
  phase?: number
): void {
  sendSSE(res, 'progress', {
    stage,
    current,
    total,
    percent: total > 0 ? Math.round((current / total) * 100) : 0,
    programName: programName || '',
    phase: phase ?? 0,
  });
}

/** SSE 완료 이벤트 전송 후 연결 종료 */
export function sendComplete(
  res: Response,
  data: Record<string, unknown>
): void {
  sendSSE(res, 'complete', data);
  res.end();
}

/** SSE 에러 이벤트 전송 후 연결 종료 */
export function sendError(res: Response, message: string): void {
  sendSSE(res, 'error', { error: message });
  res.end();
}
