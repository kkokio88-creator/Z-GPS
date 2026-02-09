/**
 * SSE (Server-Sent Events) 클라이언트
 * 서버의 장시간 작업(동기화, 분석) 실시간 진행률 수신용
 */

export interface SSEProgressEvent {
  stage: string;
  current: number;
  total: number;
  percent: number;
  programName: string;
}

interface SSECallbacks {
  onProgress: (event: SSEProgressEvent) => void;
  onComplete: (data: Record<string, unknown>) => void;
  onError: (error: string) => void;
}

const getBaseUrl = (): string => {
  return import.meta.env.VITE_API_BASE_URL || '';
};

/**
 * SSE 연결을 시작하고 진행률 이벤트를 수신
 * POST 요청이므로 fetch + ReadableStream 사용 (EventSource는 GET만 지원)
 */
export function connectSSE(
  path: string,
  callbacks: SSECallbacks
): AbortController {
  const controller = new AbortController();
  const url = `${getBaseUrl()}${path}`;

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({}),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        callbacks.onError(`HTTP ${response.status}: ${response.statusText}`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        callbacks.onError('ReadableStream을 사용할 수 없습니다.');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE 이벤트 파싱: "event: xxx\ndata: {...}\n\n"
        const events = buffer.split('\n\n');
        // 마지막 항목은 불완전할 수 있으므로 보존
        buffer = events.pop() || '';

        for (const eventBlock of events) {
          if (!eventBlock.trim()) continue;

          const lines = eventBlock.split('\n');
          let eventType = '';
          let eventData = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              eventData = line.slice(6);
            }
          }

          if (!eventType || !eventData) continue;

          try {
            const parsed = JSON.parse(eventData);

            switch (eventType) {
              case 'progress':
                callbacks.onProgress(parsed as SSEProgressEvent);
                break;
              case 'complete':
                callbacks.onComplete(parsed);
                break;
              case 'error':
                callbacks.onError(parsed.error || '알 수 없는 오류');
                break;
            }
          } catch {
            if (import.meta.env.DEV) {
              console.warn('[SSE] Failed to parse event data:', eventData);
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        callbacks.onError(`연결 오류: ${String(err)}`);
      }
    });

  return controller;
}
