import type { MessageKey } from "@gprn/i18n";

type AuthMode = "login" | "register";
export type GoogleAuthStatus =
  | "AVAILABLE"
  | "COMING_SOON"
  | "LOADING"
  | "NEEDS_CONFIGURATION"
  | "UNAVAILABLE";

export class ApiRequestError extends Error {
  readonly status: number | null;
  readonly code: string | null;

  constructor(status: number | null, code: string | null = null) {
    super(
      status === null
        ? "API is unavailable."
        : `API request failed with ${status}.`,
    );
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

export async function requestJson<T>(
  url: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  let response: Response;
  try {
    response = await fetcher(url, { ...init, credentials: "include", headers });
  } catch {
    throw new ApiRequestError(null);
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const code =
      body &&
      typeof body === "object" &&
      "code" in body &&
      typeof body.code === "string"
        ? body.code
        : null;
    throw new ApiRequestError(response.status, code);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiRequestError(null);
  }
}

export async function requestAuthSession<T>(
  apiRoot: string,
  mode: AuthMode,
  body: {
    email: string;
    password: string;
    displayName?: string;
    username?: string;
  },
  fetcher: typeof fetch = fetch,
): Promise<{ user: T }> {
  const loginBody = { email: body.email, password: body.password };
  const request = (path: string, input: typeof body) =>
    requestJson<{ user: T }>(
      `${apiRoot}${path}`,
      {
        body: JSON.stringify(input),
        method: "POST",
        signal: AbortSignal.timeout(15_000),
      },
      fetcher,
    );

  if (mode === "login") return request("/auth/login", loginBody);
  try {
    return await request("/auth/register", body);
  } catch (error) {
    // Only an existing account warrants trying its password, not an API outage.
    if (!(error instanceof ApiRequestError) || error.status !== 409)
      throw error;
    return request("/auth/login", loginBody);
  }
}

export function authErrorKey(error: unknown, mode: AuthMode): MessageKey {
  if (error instanceof ApiRequestError) {
    if (error.status === null || error.status >= 500)
      return "auth.serverUnavailable";
    if (error.status === 429) return "auth.rateLimited";
    if (error.code === "AUTH_USER_NOT_ACTIVE") return "auth.accountInactive";
    if (error.status === 401) return "auth.invalidCredentials";
    if (error.status === 409) return "auth.accountExists";
    if (error.status === 400) {
      return mode === "register" ? "auth.validation" : "auth.loginValidation";
    }
  }
  return mode === "register" ? "auth.registrationFailed" : "auth.loginFailed";
}

export function googleProviderStatus(body: unknown): GoogleAuthStatus {
  if (
    !body ||
    typeof body !== "object" ||
    !("providers" in body) ||
    !Array.isArray(body.providers)
  ) {
    return "UNAVAILABLE";
  }
  const google = body.providers.find(
    (provider: unknown) =>
      provider &&
      typeof provider === "object" &&
      "id" in provider &&
      provider.id === "google",
  );
  if (
    google?.status === "AVAILABLE" ||
    google?.status === "COMING_SOON" ||
    google?.status === "NEEDS_CONFIGURATION"
  ) {
    return google.status;
  }
  return "UNAVAILABLE";
}

export function googleUnavailableKey(status: GoogleAuthStatus): MessageKey {
  if (status === "NEEDS_CONFIGURATION") return "auth.googleNotConfigured";
  if (status === "COMING_SOON") return "auth.googleUnavailable";
  return "auth.serverUnavailable";
}
