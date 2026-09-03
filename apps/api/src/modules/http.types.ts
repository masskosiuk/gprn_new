export interface CookieRequest {
  readonly cookies?: Record<string, string | undefined>;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly ip?: string;
}

export interface CookieReply {
  clearCookie(name: string, options: Record<string, unknown>): CookieReply;
  setCookie(name: string, value: string, options: Record<string, unknown>): CookieReply;
}

