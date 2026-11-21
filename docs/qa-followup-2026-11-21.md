# SQOP QA follow-up — 2026-11-21

This change is based on the tested #35 application build. The SQL in this branch is review-only. Neither proposal has been run against production; no audit, score, photo, or production permission has been changed.

| Area | Evidence |
| --- | --- |
| Roles and access | Both SQL proposals exercised on isolated PostgreSQL. Coverage includes anonymous and inactive users, manager branch scope and own drafts, an explicitly shared audit, permitted submission/reopen writes, admin-only expiry review/deletion, and denial of unprivileged account administration. |
| Historical N/A and scores | The new draft inherits only active N/A IDs from the prior visit. Comments remain available only when the caller can independently read that visit. Existing zero and N/A tests, audit totals, report and dashboard scoring tests still pass. |
| Checklist import | App parses and stages the workbook locally; one database request commits the entire import. Isolated database tests fail at the last stage, check that no earlier insert or deactivation survives, then verify a successful replacement and append. Import is blocked for programs with saved audits because their active checklist still drives the existing reports. Use a new program/version for a replacement and verify its dashboard classification before rollout. |
| Real downloads with synthetic data | Headless Chromium produced a PDF, an XLSX, and separate branch/warehouse ZIPs with the expected approved visit only. A historical lookup failure does not stop the current PDF. Late status changes abort bulk export with a retry message. |
| Photo downloads | Audit image links are public by request. The browser uses the existing public R2 URL to open or save an image. Upload and deletion checks, audit visibility, and the authorization for photo metadata remain in place. |
| Other flows | Existing suites cover password reset/role policy, save retries, zero and N/A, audit scope and monthly follow-up, photo upload/delete, expiry, maintenance and slaughter exports. The Chromium smoke run also loaded the three corresponding sections. |

## Apply safely

1. On an isolated environment using synthetic accounts and its own bucket, apply [core access and N/A](../supabase/proposals/2026-11-21_core_access_and_na_REVIEW_ONLY.sql), then [atomic checklist import](../supabase/proposals/2026-11-21_atomic_checklist_import_REVIEW_ONLY.sql). The access proposal stops if an unexpected existing policy would be overwritten. Do not apply the older October access proposal along with this one.
2. Deploy the matching app to that QA environment. Test anonymous/inactive denial, manager/scope, auditor sharing, approval/zero writes, inherited N/A, photo upload/delete and PDF, and import rollback with its real authentication, API and storage.
3. Verify the QA server has `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, the existing service-role configuration, its own R2 credentials, and a reachable public QA image URL. Verify R2 CORS for PDF capture.
4. Before a separate, approved production cutover, review production integrations that read the affected tables, confirm recovery access as an active admin, and verify backup availability. Apply the two reviewed proposals, deploy the matching app, and check the role matrix and audit evidence with authorized accounts. Do not test by writing to live audit records.
5. Retain the public R2 endpoint for audit image viewing and downloading. Anyone with the direct image link can open it. Keep the legacy Supabase and slaughter storage policies intact.

Full automated check: provide a local PGlite module with `SQOP_PGLITE_MODULE`, run `npm run check`, `npm test -- --testTimeout=30000 --maxWorkers=2`, and `npm run build`. The two private-workbook tests are optional and require the corresponding files; no real recovery email was sent. Work on a disposable database only.
