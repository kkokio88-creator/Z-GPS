/**
 * SSE (Server-Sent Events) 헬퍼
 * 장시간 작업(동기화, 분석)의 실시간 진행률 전달용
 */

import { Response } from 'express';

/** 20초마다 SSE keepalive 코멘트를 전송하여 프록시 연결 유지 */
export function startHeartbeat(res: Response): void {
  const interval = setInterval(() => {
    if ((res as any).__sseDisconnected) {
      clearInterval(interval);
      return;
    }
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(interval);
    }
  }, 20_000);
  (res as any).__sseHeartbeat = interval;
}

/** heartbeat 인터벌 정리 */
export function stopHeartbeat(res: Response): void {
  const interval = (res as any).__sseHeartbeat;
  if (interval) {
    clearInterval(interval);
    (res as any).__sseHeartbeat = null;
  }
}

/** SSE 응답 헤더 설정 + 연결 끊김 감지 + heartbeat 시작 */
export function initSSE(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx proxy buffering 비활성화
  });
  res.flushHeaders();

  // 클라이언트 연결 끊김 감지 플래그
  (res as any).__sseDisconnected = false;
  res.on('close', () => {
    (res as any).__sseDisconnected = true;
    stopHeartbeat(res);
  });

  startHeartbeat(res);
}

/** 클라이언트가 아직 연결되어 있는지 확인 */
export function isSSEConnected(res: Response): boolean {
  return !(res as any).__sseDisconnected;
}

/** SSE 이벤트 전송 (연결 끊김 시 무시) */
export function sendSSE(
  res: Response,
  event: string,
  data: Record<string, unknown>
): void {
  if ((res as any).__sseDisconnected) return;
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    (res as any).__sseDisconnected = true;
  }
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
  stopHeartbeat(res);
  sendSSE(res, 'complete', data);
  if (!((res as any).__sseDisconnected)) {
    res.end();
  }
}

/** SSE 에러 이벤트 전송 후 연결 종료 */
export function sendError(res: Response, message: string): void {
  stopHeartbeat(res);
  sendSSE(res, 'error', { error: message });
  if (!((res as any).__sseDisconnected)) {
    res.end();
  }
}
