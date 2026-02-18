/**
 * 중앙 API 클라이언트
 * 모든 API 호출이 백엔드 프록시를 경유하도록 함
 */

import { getStoredApiKey } from './storageService';

const getBaseUrl = (): string => {
  return import.meta.env.VITE_API_BASE_URL || '';
};

interface ApiResponse<T = unknown> {
  data: T;
  ok: boolean;
  status: number;
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, statusText: string, data: unknown = {}) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T>(method: string, path: string, body?: unknown, options?: RequestInit): Promise<ApiResponse<T>> {
  const url = `${getBaseUrl()}${path}`;
  if (import.meta.env.DEV) {
    console.log(`[apiClient] ${method} ${path}`);
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  // Railway 재배포 시 서버의 env var가 소실될 수 있으므로
  // 프론트엔드에 저장된 API 키를 헤더로 전달 (서버가 fallback으로 사용)
  const storedKey = getStoredApiKey();
  if (storedKey) {
    headers['X-Gemini-Api-Key'] = storedKey;
  }

  const response = await fetch(url, {
    method,
    headers: { ...headers, ...(options?.headers as Record<string, string>) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...options,
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new ApiError(response.status, response.statusText, errBody);
  }

  // text 응답 지원 (XML 등)
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('xml')) {
    const text = await response.text();
    return { data: text as unknown as T, ok: true, status: response.status };
  }

  const data = await response.json();
  return { data: data as T, ok: true, status: response.status };
}

export const apiClient = {
  async get<T = unknown>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return request<T>('GET', path, undefined, options);
  },

  async post<T = unknown>(path: string, body: unknown, options?: RequestInit): Promise<ApiResponse<T>> {
    return request<T>('POST', path, body, options);
  },

  async put<T = unknown>(path: string, body: unknown, options?: RequestInit): Promise<ApiResponse<T>> {
    return request<T>('PUT', path, body, options);
  },

  async patch<T = unknown>(path: string, body: unknown, options?: RequestInit): Promise<ApiResponse<T>> {
    return request<T>('PATCH', path, body, options);
  },

  async delete<T = unknown>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return request<T>('DELETE', path, undefined, options);
  },
};
