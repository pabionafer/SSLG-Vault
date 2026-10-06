export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

type UnauthorizedListener = () => void;

const unauthorizedListeners = new Set<UnauthorizedListener>();

/**
 * Subscribe to expired-session events (any 401). Returns an unsubscribe fn.
 * The dashboard layout registers a handler that sends the user to /login.
 */
export function onUnauthorized(fn: UnauthorizedListener): () => void {
  unauthorizedListeners.add(fn);
  return () => {
    unauthorizedListeners.delete(fn);
  };
}

function notifyUnauthorized() {
  for (const fn of unauthorizedListeners) fn();
}

/**
 * Client-side fetch wrapper. JSON in/out; any 401 (other than a failed
 * login attempt) notifies listeners so the app can force a logout.
 */
export async function api<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<ApiResult<T>> {
  const headers = new Headers(init?.headers);
  let body = init?.body;
  if (init?.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }

  try {
    const res = await fetch(path, { ...init, headers, body });
    if (res.status === 401 && !path.startsWith("/api/auth/login")) {
      notifyUnauthorized();
      return { ok: false, status: 401, data: { error: "Session expired" } as T };
    }
    const data =
      res.status === 204
        ? (null as T)
        : await res.json().catch(() => ({ error: "Invalid response" }) as T);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Network error" } as T };
  }
}
