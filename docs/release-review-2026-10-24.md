# Release review — 24 October 2026

## Status and approval boundary

Implementation base: `b0a74f4` (dashboard/refactor patch). Changes in this review are local only. Nothing has been pushed or deployed. **All queries against the connected Supabase project were SELECT/read-only diagnostics. No production data, score, tracking row, role, policy or schema was modified.** Tests that insert/update/delete data run against mocks or isolated PostgreSQL/WASM only.

This is a completed batch of fixes and a reviewable security proposal, not a claim that every source file or every browser scenario has passed final release acceptance. Full handover remains blocked by the access/security decisions and environment configuration below, followed by Preview acceptance testing.

## Monthly tracking: confirmed causes and fixes

The actual branch names are `المعادي1`, `معادي2`, and `سوديك إيست`. The old card expected spaces and a different hamza spelling and fell back to fabricated “not started” rows. It also allowed an older draft encountered later to overwrite a submitted audit, always used the current month instead of the selected month, and cached tracking under a key without account/scope identity.

Read-only diagnosis at review time:

| Branch     | Month          | Actual audits observed                |
| ---------- | -------------- | ------------------------------------- |
| المعادي1   | October 2026   | FS: one submitted                     |
| معادي2     | October 2026   | FS: one submitted; GHP: one submitted |
| سوديك إيست | September 2026 | FS: one submitted                     |
| سوديك إيست | October 2026   | No audit observed                     |

These are observations at review time, not values copied into production or hardcoded into the app. The application derives states from the actual selected-month rows.

- Branch UUIDs establish audit ownership. Canonical name matching only places branch rows into display groups. It handles spaces, Arabic/Persian digits, hamza and the known Maadi name variants. It never borrows a Sodic East/Sodic Caesar audit for Sodic, or a Dark Store Maadi audit for Maadi 1/2.
- A submitted audit wins over drafts regardless of response ordering. Draft-only means in progress. Without an audit the existing manual status remains.
- The chosen month controls both data sources and the month badge. Branch/program filters affect displayed rows/columns. Data changes update the derived state without depending on the first tracking request's captured audit array.
- Page loading is read-only, including when manual tracking rows do not yet exist. A missing row can be initialized by an explicit administrator action. Viewing the page no longer seeds database rows.
- Automatic statuses are marked with source/counts and cannot be cycled manually. Manual status clicks keep the previous three-state cycle and report save errors; missing/denied updates cannot falsely appear successful.
- Loading, error/retry and no-matching-branches states replace fake missing-branch states. Real extra branches appear in an additional group rather than disappearing.

The two original bug regression tests were run before the fix and failed. They pass after it. The older characterization test for “last draft wins” was deliberately changed because that behavior was the reported bug; the frozen pre-refactor oracles were not rewritten.

## Other code and UX changes in this batch

- Shared navigation adds direct audit actions, preserves role visibility, labels collapsed icons, identifies the current page, uses a horizontal mobile menu and supports skipping to the main content. Headers wrap on small screens. Logout is guarded against repeated clicks and surfaces failure.
- Session loading is extracted and ignores stale responses from a previous account or a logged-out/unmounted provider. Profile/role read failures are visible. Inactive/missing accounts do not mount protected child screens. This is a UI guard, not a substitute for database authorization.
- Inspectors land in their audit list; management lands in the dashboard. Password recovery takes precedence over automatic redirects. Existing-account sign-in leaves password validity to Supabase; registration/new-password rules retain the eight-character minimum. No passwords were changed.
- User deletion no longer silently removes only profile/role rows after a failed account-deletion RPC or falsely announces permanent blocking. Errors remain visible for retry.
- The unused privileged role server function now validates its caller against Supabase, requires an active admin and writes the new role atomically instead of deleting the old role first.
- Audit photo signing and deletion move to server-only modules. No R2 access key or secret remains in browser source. Server code checks the verified account, active status, audit ownership and question program before authorizing operations. Storage deletion failure retains the database record for retry. Public URL mapping and the existing image compression defaults remain.
- The build now disables broad environment injection, exposes only the three known public settings and fails a credential-boundary check if private values/names or AWS credential objects appear in public output. Existing private `VITE_R2_*` values were observed in compiled browser assets even after removing the photo-source fallback; the explicit build allowlist addresses this second exposure path.
- Added `npm run check` and `npm run verify` for strict type checking and the application validation sequence. No package dependency or lockfile was changed.

### Storage configuration needed BEFORE deploying this full batch

Add these as **server secrets**, never `VITE_` variables and never source literals:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- Optional `R2_BUCKET_NAME` (default `audit-photos`)

Keep `VITE_R2_PUBLIC_URL` as the public, non-secret image base URL if the app currently uses it. Existing photo database paths are unchanged. New uploads require the server secrets above; missing settings show an explicit error instead of using a bundled credential fallback. Use the project's Secrets settings; do not paste secrets into chat.

R2 credentials were previously embedded in client-delivered source. They must be replaced/revoked through the storage account after the new server configuration is verified. Remove the old `VITE_R2_ACCESS_KEY_ID` / `VITE_R2_SECRET_ACCESS_KEY` settings after configuring server-only replacements; refresh client pages after deployment. **No credential was rotated, revoked or published by this work.** Older commits/builds may still contain those old credentials, so removing them from current source alone does not invalidate them.

## Database proposal — NOT applied

File: `supabase/proposals/2026-10-24_access_hardening_REVIEW_ONLY.sql`.

The live catalog showed 17 core/legacy tables with RLS disabled and anonymous read/write table grants. Monthly tracking had a broad authenticated-all policy. Several privileged role-setting/deletion RPCs had public execution grants. The used `delete_user_completely(uuid)` function contained deletes without a caller authorization check.

The proposal is transactional and refuses to silently combine with unexpected policies. It changes metadata/access rules only; no historical answer, NULL, visit or score is repaired/recalculated/deleted by executing the proposal. The guarded deletion function still only deletes an account when subsequently invoked by an authorized active administrator.

Proposed access matrix:

| Data/action                                 | Active admin                      | Active manager    | Active auditor    | Anonymous/inactive |
| ------------------------------------------- | --------------------------------- | ----------------- | ----------------- | ------------------ |
| Read audits and attached records            | All                               | All               | Own/assigned only | Denied             |
| Modify audit records                        | All                               | Own/assigned only | Own/assigned only | Denied             |
| Read checklist configuration                | Yes                               | Yes               | Yes               | Denied             |
| Modify checklist configuration              | Yes                               | No                | No                | Denied             |
| Read monthly tracking                       | Yes                               | Yes               | No                | Denied             |
| Write manual monthly tracking               | Yes                               | No                | No                | Denied             |
| Change roles                                | Yes, cannot demote own admin role | No                | No                | Denied             |
| Change profile display name                 | Authorized rows                   | Own name          | Own name          | Denied             |
| Client-side update of activation flag       | No direct client grant            | No                | No                | Denied             |
| Delete another account through the used RPC | Yes                               | No                | No                | Denied             |
| Read legacy deduction tables                | Yes                               | Yes               | No                | Denied             |

The proposal covers these 18 tables: profiles, user_roles, branches, audit_types, sections, headers, questions, audits, audit_answers, audit_section_status, audit_section_deductions, audit_general_deductions, photos, reports, audit_edit_logs, general_deductions, section_deductions, monthly_branch_tracking. Existing slaughter/expiry/Power BI policies are not replaced or widened.

Legacy privileged role RPCs unused by the current source are revoked for browser callers, including their overloads: admin_set_role, assign_role, assign_user_role, change_user_role, delete_user_by_admin, exec_set_role, set_admin_status, set_user_role, set_user_role_v2, update_member_role. The current UI uses direct role upsert; the used account-deletion RPC retains its name/signature with an added admin check. Any external client relying on the revoked anonymous or legacy-RPC access will lose that access; review such integrations before approving.

Private SECURITY DEFINER lookup helpers are necessary to avoid recursive policies on the role/profile tables. They use a fixed empty search path, return only request-specific authorization facts, and are not public Data API functions. The admin deletion RPC has explicit authentication/active-role checks before any delete.

**Approval requested before applying this proposal to the connected database.** First apply to a disposable copy and run Preview acceptance checks. The SQL file is a proposal, not an auto-run migration, and is not executed by the build.

## Validation and remaining acceptance

Before this batch: 144 tests passed; strict TypeScript and production build passed.

Tests include actual Supabase/TanStack clients with mocked networks; exact existing scoring/export characterization checks; branch identity/order/month regression tests; session-account race tests; server authorization and storage-failure checks; and the proposed policies in isolated PostgreSQL. No live write was used as a test.

```sh
npm run verify
```

SQL tests remain optional without an isolated PGlite runtime (the existing project pattern). For the full SQL suite, install `@electric-sql/pglite@0.5.11` in a separate QA directory and set `SQOP_PGLITE_MODULE` to its absolute `dist/index.js` before running the command. The full validation here uses that runtime; do not point tests at production.

Remaining release acceptance: real browser desktop/mobile testing; login/recovery/logout with test accounts; all three roles after applying the approved access rules to a disposable copy; create/edit/submit/reopen/delete audit flows; image upload/read/delete after server secrets are configured; monthly branch/program/month filtering; Excel/PDF visual checks; production-like network timings. Local browser binaries are unavailable in this environment, so SSR/interaction/unit tests do not establish visual perfection or live end-to-end success.

Continue the detailed review of remaining checklist mutation/report/slaughter interactions after resolving the approval/configuration blockers. No “whole project finished/zero bugs” claim is made by this batch.

## Additional audit workflow review

- District 5 remains in Dr Maged's monthly tracking group, including spaced and Arabic-digit spellings.
- New-audit scope changes reset the selected program. Load failures and empty option lists have explicit feedback and retry. Invalid/stale selections cannot create an audit.
- Report reopening verifies the updated row and always releases the busy state. Log failures are distinguished from a failed business operation.
- Deduction writes share validated add/remove helpers. Deletions are constrained to their audit and section. Failed additions retain the entered fields; saving and submission are mutually guarded. Fractional percentages and existing scoring rules are preserved.
- Answer persistence publishes its unsaved count and offers retry. Leaving the audit route flushes queued answers; failure blocks navigation. Closing/reloading the document prompts while unsaved answers or section changes remain. Real browser acceptance of these navigation guards is still required.
- Section N/A changes revert their local optimistic state on failure. Answer scores and historical unresolved NULL answers are not repaired or guessed.
- Summary/history Excel exports catch errors and guard repeated requests. Temporary PDF render roots are cleaned up even on failure. Audit deletion only reports success for a confirmed returned row.
- Checklist files are read and parsed through the actual import parser using an in-memory sink before replacement starts. Empty files and files with no importable questions are rejected without database requests. Import writes and replacement steps stop on database errors. Successful legacy FS/GHP/FSMS/master-template import payloads remain covered by the existing parity fixtures.
- Checklist replacement is still multiple requests, without transaction rollback. Failures after replacement begins still require transaction design work before claiming atomic replacement safety. No database transaction RPC was added or applied.
- Slaughter report load errors offer retry; gallery request failures no longer reject an unhandled promise or update a departed page.

These changes were inspected and tested locally without live database mutations. This remains a review checkpoint, not completed browser acceptance or a production deployment.

## Admin data and checklist editing follow-up

- Extracted user/role and checklist loading from UI components. A shared page reader retrieves all rows in stable order, propagates errors from every page, and honors cancellation. Headers are restricted to the loaded program's sections in bounded batches.
- User directory refuses to display guessed roles when the roles request fails. Manager and auditor totals are counted separately. Account mutation controls are locked during role/deletion requests, and role updates verify a returned row.
- Checklist loading has explicit loading/error/retry states. Import disables other checklist controls while running and refreshes the tree even after failure, so partial changes are not hidden by stale data.
- Question editing resets the header when its section changes, validates the relationship before saving, locks repeated save/delete/activation requests, and confirms returned rows.
- Type deletion stops if its linked-audit count cannot be verified. Section/header deletions stop at the first failed step and refresh afterwards. Order-change failures are reported rather than silently accepted. These multi-request actions remain non-atomic; database transaction work is not applied.
- Audit status badges now use the actual draft/submitted status, with a separate read-only badge.

Validation: 199 tests across 41 files passed, strict TypeScript passed, and the production build/public-credential scan passed. Five added tests use the real Supabase client with a mocked network to check 501-row reads, failed role reads, partial-page failure and cancellation. No production database writes were used for this verification. Browser desktop/mobile acceptance remains outstanding.

## Expiry and report persistence follow-up

- Expiry records and branches now load with stable pagination and cancellation. Failed reads show retry and block incomplete exports; they are not displayed as an empty successful result.
- Expiry entry validation retains zero deductions, optional quantities, fractional percentages and existing export/filter rules. It rejects invalid calendar dates, negative/fractional piece counts and percentages outside 0–100 before a request. Existing rows are not rewritten.
- Default expiry/filter/export dates use the Cairo calendar, including UTC midnight/month boundaries. Editing can be cancelled explicitly. Pending writes lock the form and record actions; review/delete failures are visible, and row mutations verify a returned record.
- Extracted audit-log persistence from PDF/DOCX generation. Existing callers keep business-save success separate from a failed log write; the logger now actually propagates authentication/database errors instead of silently ignoring them. Actor identity and existing action/detail caps are preserved.
- Report generation no longer returns successful archive paths after failed uploads or failed registration. Storage and report registration remain separate requests; no automatic cleanup or database transaction was added.

Validation: 210 tests across 43 files passed, including the unchanged scoring/finalization/export regression coverage. Added tests cover expiry validation, Cairo date boundaries, 501-row expiry reads, log attribution/failure, and report storage/registration failures using mocked networks. TypeScript passed. Real browser acceptance and production deployment remain outstanding; no connected database data/schema/policy changes were made.

## Requested manager draft privacy

Application changes:

- Updated by the later user instruction: managers request submitted audits plus their own/assigned audits. Their drafts tab is labelled «مسوداتي قيد التنفيذ» and excludes other auditors' drafts.
- A shared parent gate blocks other users' draft URLs before mounting the audit runner, summary or report. Managers may create, view, edit, submit and reopen their own/assigned audits under the existing ownership rules. Admin/auditor access is preserved.
- Dashboard detail queries request submitted audits only for managers. Draft shortcuts/counts are hidden, and the snapshot is filtered before caching and display. Audience-specific keys prevent reuse of unrestricted cached results.

Database protection is NOT deployed:

- Existing RLS-disabled core tables and the existing SECURITY DEFINER snapshot RPC still require database changes for a security boundary. Frontend guards cannot prevent a custom Data API request, and the old snapshot RPC can still return draft entries in its raw network response until its definition is replaced.
- The existing broader access proposal was updated so manager SELECT checks reject other auditors' drafts, while ownership permits access to the manager's own/assigned drafts. This proposal enables RLS and changes access rules on 18 tables as described above; it is not merely a UI setting and needs separate review/approval.
- `supabase/proposals/2026-10-24_manager_dashboard_REVIEW_ONLY.sql` proposes replacing the read-only dashboard RPC to omit drafts for managers on the server. It preserves the admin response and scoring expressions. It is based on the checked-in RPC definition; inspect/compare the live definition before applying.
- Neither proposal was executed. Historical audits, answers and scores remain untouched. Do not run these SQL files from the Preview package without explicit approval.

Validation: 214 tests passed, including isolated PostgreSQL checks that managers cannot read their own/others' drafts or attached answers, cannot promote their hidden draft, still read submitted audits, retain monthly tracking read access, and cannot modify another user's audit. The isolated dashboard RPC omits drafts for managers while admin scoring/scope behavior stays covered. Browser acceptance with real role accounts remains outstanding.

## Manager-owned drafts and formula-driven audit export

This supersedes the earlier blanket manager-draft restriction. Managers may create audits and read/edit their own or assigned drafts; the list, direct-route gate and permission helper enforce ownership. Other auditors' drafts remain hidden in the application. The unexecuted RLS proposal now matches this exception; no database changes were applied.

`exportAuditToExcel` now loads the same active checklist and answer model as the on-screen report, without photos, then builds an editable workbook. The summary links section totals to the final result; section subtotals link editable scores through N/A eligibility, section deductions and existing rounding. General deductions are subtracted as percentage points, matching `computeAudit`. Excel percentages are stored as native numeric ratios and formatted as percentages.

Warehouse exports use the actual audit's warehouse name/code/manager, auditor, date, audit ID, version, program and checklist sections. Labels distinguish warehouses from branches. The reference Stores/DS/FSMS files were inspected read-only as layout/formula references; no uploaded workbook or checklist database data was replaced.

Confirmed discrepancies in the prior exporter, fixed within export only:

- Static summary and section totals could not respond to editing an item score.
- Historic non-N/A NULL scores were exported as full credit. They now remain blank and the final result shows «درجات تحتاج مراجعة» until resolved in Excel; no saved database answer is changed.
- The summary always excluded delivery, including dark stores, while the scoring engine includes it for the three configured dark stores. Export now follows `includesDeliveryInOverall`.
- Internal deduction rounding (one decimal per deduction) differed from the engine's combined percentage and two-decimal rounding. The workbook now follows the engine's order and rounding.
- The old direct export loaded inactive questions and ignored secondary load errors. Loading through the report model aligns with its active checklist and propagates read failures.

Validation: 219 tests passed, TypeScript and production build passed. A separate spreadsheet engine recalculated the generated formula graph after editing a score 4→2→0→blank→N/A→restore: group/section/final results updated, and blanks remained unresolved. The final error scan had no formula errors. All four synthetic-fixture sheets were rendered and inspected; the fixture contains no real audit data. Native desktop Excel and real-role browser acceptance remain required before release. Formula edits affect only the downloaded workbook, not the application database.

## N/A inheritance and warehouse aggregate download fixes

The previous runner selected either all saved answers or all inherited answers. A single new saved answer therefore hid other inherited N/A entries; the same issue existed for section statuses. The shared carry-over loader now retrieves N/A only from an earlier audit in the same branch/program, with active-question/section filtering. Defaults merge per stable question/section ID, and explicit current values (including false and zero) take precedence.

Read-only viewing, report loading and Excel export do not persist anything. Explicit creation now copies inherited N/A into the new draft using ignore-duplicates upserts. Opening the summary saves still-missing inherited defaults after pending answer writes finish. Finalization saves section exclusions and N/A answer defaults before the final re-read and submission. Existing answers/statuses are never overwritten by defaults. Submitted audits no longer dynamically inherit changes from a later source. Historical audits are not backfilled or recalculated.

The warehouse aggregate export now uses the normal default Excel-library import from a lazy download module, reports errors, and guards repeated downloads. It loads deductions only for exported audit IDs, with pagination and error propagation. Warehouse program indicators resolve the warehouse audit type IDs by program code/name, rather than assuming branch UUIDs. Warehouse detail columns use the actual warehouse checklist sections and warehouse labels; branch workbook output retains its previous parity coverage.

Validation: 229 tests passed across 48 files, strict TypeScript passed, and production build/public credential scan passed. Added tests cover per-item and per-section merge precedence, scoped/chronological read-only defaults, explicit creation seeding, insert-only persistence, and source failures. A stateful mocked-network flow goes from a partially saved zero answer through summary loading, N/A persistence, submission, reload after source changes and Excel output. Warehouse tests use different type IDs and actual warehouse section names, assert the download writer is invoked, serialize/read valid XLSX bytes and check deduction failure propagation. No live database mutation was used. Actual browser download acceptance is still required.

## Empty discrepancy log export regression

Reproduced the reported `Cannot set properties of undefined (setting 's')` by exporting an aggregate with no discrepancies. `json_to_sheet([])` did not create a header cell, but the formatting loop assumed one existed. The discrepancy log now always receives its explicit headers; formatting loops also guard absent cells without inventing numeric values. The added test failed with the user's exact error before the fix and passed afterwards. Existing nonempty branch workbook parity remains covered. Validation: 230 tests passed, strict TypeScript passed, and production build/public credential scan passed. No database changes were applied.

## Green dashboard presentation — 2026-10-25

User selected concept 1 and explicitly required retaining every existing dashboard section.
The dashboard opts into a scoped green theme: lighter background, forest sidebar,
white panels, roomier filters and KPI cards, clearer ranking table, responsive spacing.
Existing FS/GHP/FSMS sections, ISO results, activity cards, ranking, monthly tracking,
metric drilldowns and scope/role conditions remain in place. No query, scoring,
export or database changes. Section cards are now keyboard-accessible buttons;
parity tests compare all inner content and selection for every existing threshold.
AST comparison verified route, filter and ranking changes contain only presentation
attributes. TypeScript, full suite and production build checked. Browser visual
acceptance is pending: installed Playwright has no browser executable here.

## Application-wide green presentation — 2026-10-25

Extended the selected green design across the shared shell and navigation, audit
list/create/runner/summary/report screens, warehouses (dashboard scope), slaughter,
expiry, administration, login and registration. Added stable presentation hooks to
shared inputs, selects, buttons, cards, tabs and dialogs. Controls have roomier
spacing, clear focus, readable tables and bounded mobile dialog heights. Screen-only
control/layout rules avoid resizing printable documents. Dark palette remains available.
All ten changed route ASTs match HEAD after removing presentation attributes:
queries, mutations, validation, permissions, N/A, scoring, exports and rendered
sections are unchanged. No database access or modifications were performed.
Validation: 230 tests across 48 files, TypeScript and production build/public asset
credential check. Actual browser visual/interaction acceptance remains pending;
local Playwright has no installed Chromium executable. This is a shared visual
pass, not a claim that every page has passed browser acceptance.

## Root-level theme activation — 2026-10-25

User reported that Preview still showed the green theme only for branches and
warehouses. That deployed symptom was not reproduced locally; do not attribute
it to caching or claim a confirmed deployment cause. Removed the unused dashboard
appearance prop and route theme marker. RootShell now emits data-sqop-theme=green
on the HTML document, and shared styles select that document marker directly.
Main-content sizing is scoped to app-content so registration's main layout is
not accidentally widened. Theme tokens also reach portal controls. The actual
RootShell function was compiled/rendered independently to verify the global
marker and retained route content. Full 230-test suite and TypeScript pass.
A cumulative package contains all changed project files since b0a74f4, including
both UI batches and this correction, avoiding dependence on sequential UI ZIPs.
No live database operations or deployment. Browser visual acceptance remains pending.
