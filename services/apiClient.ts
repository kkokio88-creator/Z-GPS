/**
 * 중앙 API 클라이언트
 * 모든 API 호출이 백엔드 프록시를 경유하도록 함
 */

const getBaseUrl = (): string => {
  return import.meta.env.VITE_API_BASE_URL || '';
};

interface ApiResponse<T = unknown> {
  data: T;
  ok: boolean;
  status: number;
}

export const apiClient = {
  async get<T = unknown>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
    const url = `${getBaseUrl()}${path}`;
    if (import.meta.env.DEV) {
      console.log(`[apiClient] GET ${path}`);
    }

    const response = await fetch(url, {
      method: 'GET',
      ...options,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // text 응답 지원 (XML 등)
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('xml')) {
      const text = await response.text();
      return { data: text as unknown as T, ok: true, status: response.status };
    }

    const data = await response.json();
    return { data: data as T, ok: true, status: response.status };
  },

  async post<T = unknown>(path: string, body: unknown, options?: RequestInit): Promise<ApiResponse<T>> {
    const url = `${getBaseUrl()}${path}`;
    if (import.meta.env.DEV) {
      console.log(`[apiClient] POST ${path}`);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: JSON.stringify(body),
      ...options,
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const error = new Error(`HTTP ${response.status}`);
      (error as Error & { response: { status: number; data: unknown } }).response = { status: response.status, data: errBody };
      throw error;
    }

    const data = await response.json();
    return { data: data as T, ok: true, status: response.status };
  },

  async put<T = unknown>(path: string, body: unknown, options?: RequestInit): Promise<ApiResponse<T>> {
    const url = `${getBaseUrl()}${path}`;
    if (import.meta.env.DEV) {
      console.log(`[apiClient] PUT ${path}`);
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: JSON.stringify(body),
      ...options,
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const error = new Error(`HTTP ${response.status}`);
      (error as Error & { response: { status: number; data: unknown } }).response = { status: response.status, data: errBody };
      throw error;
    }

    const data = await response.json();
    return { data: data as T, ok: true, status: response.status };
  },

  async patch<T = unknown>(path: string, body: unknown, options?: RequestInit): Promise<ApiResponse<T>> {
    const url = `${getBaseUrl()}${path}`;
    if (import.meta.env.DEV) {
      console.log(`[apiClient] PATCH ${path}`);
    }

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: JSON.stringify(body),
      ...options,
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const error = new Error(`HTTP ${response.status}`);
      (error as Error & { response: { status: number; data: unknown } }).response = { status: response.status, data: errBody };
      throw error;
    }

    const data = await response.json();
    return { data: data as T, ok: true, status: response.status };
  },

  async delete<T = unknown>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
    const url = `${getBaseUrl()}${path}`;
    if (import.meta.env.DEV) {
      console.log(`[apiClient] DELETE ${path}`);
    }

    const response = await fetch(url, {
      method: 'DELETE',
      ...options,
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const error = new Error(`HTTP ${response.status}`);
      (error as Error & { response: { status: number; data: unknown } }).response = { status: response.status, data: errBody };
      throw error;
    }

    const data = await response.json();
    return { data: data as T, ok: true, status: response.status };
  },
};
