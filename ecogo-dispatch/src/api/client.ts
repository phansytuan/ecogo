import { clearToken, getRefresh, getToken, setSession } from '../auth/token';

export const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const rt = getRefresh();
  if (!rt) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        setSession(data.accessToken, data.refreshToken);
        return true;
      } catch {
        return false;
      }
    })();
  }
  const ok = await refreshing;
  refreshing = null;
  return ok;
}

export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401 && token) {
    // try a single transparent refresh, then retry the original request once
    if (!retried && (await tryRefresh())) {
      return api<T>(path, init, true);
    }
    clearToken();
    onUnauthorized?.();
    throw new ApiError(401, 'Phiên đăng nhập đã hết hạn');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `Lỗi ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}
