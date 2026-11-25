export const boardApi = '/api/apartment-notices';
export const noticeAuthApi = `${boardApi}/auth`;

export class NoticeError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export async function noticeRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok) throw new NoticeError(data.error);
  return data;
}

export function noticeJsonRequest<T>(url: string, method: 'POST' | 'PATCH', body: object = {}) {
  return noticeRequest<T>(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
