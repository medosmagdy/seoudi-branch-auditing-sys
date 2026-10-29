# Photo session recovery

The deployed error reported by the user is the explicit server auth rejection. This identifies the failing stage, but does not by itself distinguish expiration from a wrong Supabase project/configuration.

Photo operations now refresh a token that expires within 60 seconds. Deletion retries once with a refreshed session only when the server rejects authentication before mutation. Concurrent photo operations share an in-flight refresh. Permission, storage, transport and database failures are not retried. Nothing signs the user out or clears unsaved answers.

Invalid server API keys and auth-service outages now produce separate safe messages rather than an expired-session error. Verification of the user, active profile, role, ownership and sharing remains on the server. No authentication bypass or database changes were made.

Validation: 22 focused tests; TypeScript; production build and public credential scan. Includes successful refresh, failed refresh, repeated rejection, simultaneous refresh, no retry on permission/storage failure, and server configuration/outage classification. No live photo was deleted and no deployed browser acceptance test was performed.

Install this cumulative ZIP over the existing project and rebuild/deploy. No SQL is required. If a fresh session is still rejected, confirm that the deployed frontend VITE_SUPABASE_URL and server SUPABASE_URL refer to the same intended project and that the server service key belongs to that project. Do not paste keys into chat or move them into public variables. A continuing failure after installation needs deployment configuration/log inspection; this patch does not claim to have verified those settings.
