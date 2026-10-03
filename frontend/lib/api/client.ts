/**
 * The typed service layer's HTTP client. Components never call `fetch`; they
 * call functions in lib/api/*, which call `request()` here. Requests go to
 * /api/* on this origin, which Next.js proxies to Django (next.config.ts),
 * so the session + CSRF cookies are first-party.
 *
 * Dev-only switches (append to the page URL) to preview UI states:
 *   ?mock=error  → every service call fails with a network error
 *   ?mock=empty  → list endpoints return no data
 *   ?mock=slow   → 2.5s extra latency to inspect skeletons
 *   ?mock=gmail  → Gmail access has expired: Gmail-backed calls fail with the
 *                  Gmail-access error; account, preferences and sync status
 *                  still load and show "Needs reconnect"
 */

export type ApiErrorCode = "network" | "gmail" | "ai" | "auth" | "not_found" | "validation" | "server";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: ApiErrorCode = "network",
    /** Per-field validation messages from the API, when it sent any. */
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type MockMode = "normal" | "error" | "empty" | "slow" | "gmail";

export function mockMode(): MockMode {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") return "normal";
  const m = new URLSearchParams(window.location.search).get("mock");
  return m === "error" || m === "empty" || m === "slow" || m === "gmail" ? m : "normal";
}

export const isEmptyMode = () => mockMode() === "empty";

export const GMAIL_ERROR = "We couldn't access your Gmail. Reconnect your account to continue.";
const NETWORK_ERROR = "We couldn't reach Oppora. Check your connection and try again.";
const SERVER_ERROR = "Something went wrong on our side. Try again in a moment.";

/** Stage 7 only: sign in as the seeded demo user until Google OAuth lands (Stage 8). */
// The backend refuses it unless DEBUG and DJANGO_DEV_LOGIN are on.
const DEV_LOGIN = process.env.NODE_ENV !== "production";

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions<T> {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  /** Value returned under ?mock=empty (list endpoints). */
  empty?: () => T;
  /** `false` for endpoints that don't read Gmail data (account, preferences, sync status). */
  gmail?: boolean;
}

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

let csrfPromise: Promise<string> | null = null;

/** Django's CSRF token (cookie), fetched once if the cookie isn't set yet. */
async function csrfToken(): Promise<string> {
  const cookie = readCookie("csrftoken");
  if (cookie) return cookie;
  csrfPromise ??= fetch("/api/auth/csrf", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((d: { csrfToken: string }) => d.csrfToken)
    .finally(() => (csrfPromise = null));
  return csrfPromise;
}

let loginPromise: Promise<boolean> | null = null;

function devLogin(): Promise<boolean> {
  loginPromise ??= (async () => {
    const r = await fetch("/api/auth/dev-login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-CSRFToken": await csrfToken() },
    });
    return r.ok;
  })().finally(() => (loginPromise = null));
  return loginPromise;
}

function timeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function toQuery(query?: Query): string {
  if (!query) return "";
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

async function toError(res: Response): Promise<ApiError> {
  let code = "";
  let message = "";
  let fields: Record<string, string[]> | undefined;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; fields?: Record<string, string[]> } };
    code = body.error?.code ?? "";
    message = body.error?.message ?? "";
    fields = body.error?.fields;
  } catch {
    // not JSON (proxy or server error page)
  }
  if (code === "gmail_access") return new ApiError(GMAIL_ERROR, "gmail");
  if (res.status === 401) return new ApiError(message || "Your session has expired. Sign in again to continue.", "auth");
  if (res.status === 404) return new ApiError(message || "This no longer exists.", "not_found");
  if (res.status === 400) return new ApiError(message || "Some fields are invalid.", "validation", fields);
  if (res.status >= 500) return new ApiError(SERVER_ERROR, "server");
  return new ApiError(message || NETWORK_ERROR, "network");
}

/** One API call. Paths have no trailing slash: `/opportunities/<id>`. */
export async function request<T>(path: string, opts: RequestOptions<T> = {}): Promise<T> {
  const mode = mockMode();
  if (mode === "slow") await new Promise((r) => setTimeout(r, 2500));
  if (mode === "error") throw new ApiError(NETWORK_ERROR, "network");
  if (mode === "gmail" && opts.gmail !== false) throw new ApiError(GMAIL_ERROR, "gmail");
  if (mode === "empty" && opts.empty) return opts.empty();

  const method = opts.method ?? "GET";
  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = { Accept: "application/json" };
    const tz = timeZone();
    if (tz) headers["X-Timezone"] = tz;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET") headers["X-CSRFToken"] = await csrfToken();
    return fetch(`/api${path}${toQuery(opts.query)}`, {
      method,
      headers,
      credentials: "same-origin",
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  };

  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && DEV_LOGIN && (await devLogin())) res = await send();
  } catch {
    throw new ApiError(NETWORK_ERROR, "network");
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

interface Page<T> {
  count: number;
  next: string | null;
  results: T[];
}

/** Every page of a paginated list endpoint. */
export async function listAll<T>(path: string, query: Query = {}, opts: Pick<RequestOptions<T[]>, "gmail"> = {}): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const p = await request<Page<T>>(path, { query: { ...query, page, page_size: 200 }, empty: () => ({ count: 0, next: null, results: [] }), ...opts });
    out.push(...p.results);
    if (!p.next) return out;
  }
}
