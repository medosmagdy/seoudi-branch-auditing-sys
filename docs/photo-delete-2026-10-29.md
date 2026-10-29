# Audit photo deletion

This package includes the cumulative changes since the uploaded source.

- Audit photo delete now returns expected failures as a structured result, so the UI can show an actionable, allowlisted error instead of discarding every failure behind a generic toast. Provider messages and credentials are not returned to the browser.
- The delete button is disabled while its request runs, with a synchronous lock to prevent duplicate deletion requests.
- A confirmed NoSuchKey response permits stale photo metadata removal. AccessDenied, missing bucket, connection errors and failed database deletion remain failures. Storage failure retains metadata for retry.
- Server ownership, active-account and explicit sharing checks remain required. No broad client-side delete fallback was added.

Verification: 14 focused tests passed; TypeScript and production build/public credential scan passed. Database read checks found all 1,135 photo paths use their audit ID prefix and no custom photo-table delete triggers. No live image was deleted for testing. The deployed failure cannot be attributed to a specific storage credential/configuration without its detailed error. This change makes expected errors visible after installation; it does not claim to repair an unknown hosting configuration.

No database schema, permissions or production rows were changed for this fix. The earlier audit-sharing and manager-branch-scope database changes are already activated; do not rerun their SQL proposals.

Apply the ZIP files over the existing project and rebuild/redeploy. Server photo operations require SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and optionally R2_BUCKET_NAME (defaults to audit-photos). Never put storage secrets in public VITE variables.
