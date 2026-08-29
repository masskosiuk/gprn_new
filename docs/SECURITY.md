# Security Notes

- Passwords must be hashed using Argon2id.
- OAuth tokens must be encrypted before storage.
- The frontend is not trusted for authorization.
- Uploads require MIME, extension, size and image validation.
- Original files, RAW files and provenance evidence are private by default.
- Private assets must be served through signed URLs or authorized API flows.
- Exact GPS coordinates must never be public without explicit user choice.
- Duplicate voting and self-voting must be blocked server-side.
- Suspicious activity should create review signals; do not automatically permanently ban based on one weak signal.
- Sensitive administrative actions must write audit logs.
- Production requires monitoring, backups and tested restore procedures.

