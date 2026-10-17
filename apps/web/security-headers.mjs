/** @param {{ nonce?: string, development?: boolean }} options */
export function contentSecurityPolicy({ nonce, development = false } = {}) {
  const scripts = nonce
    ? `'nonce-${nonce}' 'strict-dynamic'`
    : "'unsafe-inline'";
  return [
    "default-src 'self'",
    `script-src 'self' ${scripts}${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: http: data: blob:",
    "media-src 'self' https: http: blob:",
    "connect-src 'self' https: http:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}
