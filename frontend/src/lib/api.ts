export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let errorMessage = 'An error occurred';
    try {
      const errorJson = await response.json() as { error?: string; message?: string };
      errorMessage = errorJson.message || errorJson.error || errorMessage;
    } catch {
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }
  if (response.status === 204) return {} as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T = unknown>(path: string, options: RequestInit = {}) => apiFetch<T>(path, options),
  post: <T = unknown>(path: string, body: unknown, options: RequestInit = {}) => apiFetch<T>(path, { ...options, method: 'POST', body: JSON.stringify(body) }),
  put: <T = unknown>(path: string, body: unknown, options: RequestInit = {}) => apiFetch<T>(path, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  patch: <T = unknown>(path: string, body: unknown, options: RequestInit = {}) => apiFetch<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T = unknown>(path: string, options: RequestInit = {}) => apiFetch<T>(path, { ...options, method: 'DELETE' }),
};
