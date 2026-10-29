# Dashboard performance and application refactor — 24 October 2026

Base: `5cafb64` (location dropdown update). Apply this patch over that version. No new SQL or package dependency is required. This is a local implementation, not a deployed production change.

## What changed

- Dashboard snapshot and detail requests start independently. Details no longer wait for the snapshot request to finish.
- Stable, user/filter-scoped query keys replace detail keys based on snapshot completion timestamps. Refreshing the snapshot no longer creates another detail cache entry.
- The existing 30-second freshness window is now respected on remount. Returning to an unchanged, fresh filter uses the in-memory cache. Stale data refreshes on remount. Manual dashboard refresh requests both snapshot and details. No persistent browser data cache was introduced.
- Successful audit creation, edits, section N/A changes, deductions, reopening, deletion and checklist changes invalidate dashboard data. Submission already invalidated the same query prefix. Logout still clears the application's query client.
- Answer loading and section N/A loading overlap. Cancellation is checked before starting and before returning detail data. Pagination, scope filters, answer ownership and error propagation remain in place.
- Aggregate scoring indexes submitted visits by branch/month/program instead of repeatedly filtering the entire visit array. Array order, floating-point summation order, weights, available-program behavior, deduction rules, ranking and ties are preserved.
- Dashboard detail calculations, branch drilldowns, date handling, monthly tracking and workbook construction now live in separate modules. Section cards and monthly tracking presentation are separate components. The Excel builder loads on export.
- Expiry filtering and workbook generation are separate from the route; its spreadsheet dependency loads on export.
- Checklist workbook import is separate from the administration UI and loads when importing. Its existing insert order, defaults, format detection, counters, notifications and replace/append sequence are preserved.
- A type-only application schema extends the older generated Supabase types for the already-used manager role, tracking and expiry features. It does not create database objects, change enum values or alter authorization. Existing strict TypeScript issues were corrected with erased annotations/assertions and equivalent environment-variable property access.

Existing modular audit creation, answer writes, audit finalization, report/scoring and slaughter calculation/export code retain their behavior and are included in the full regression suite. This is an application-level restructuring of the intertwined areas, not a claim that every source file was rewritten.

## Before/after evidence

Before editing: 118/118 tests passed, production build passed, strict TypeScript reported 55 existing errors.

Characterization oracles under `__fixtures__/pre-refactor-*` preserve the prior implementations. They are imported only by tests, never by application modules. The frozen dashboard oracles intentionally retain old type issues under test-only `@ts-nocheck`; production files do not suppress type checking. Do not update an oracle merely to make a changed behavior pass.

Additional comparisons cover:

- 96 combinations of dashboard details, roles, branches, periods, findings and drilldowns, including input immutability.
- 288 aggregation combinations with exact numeric equality, plus 2,400 visits across 80 branches and 24 months. Includes missing programs, deductions, unknown programs, inactive/empty branches and ranking behavior.
- Dashboard workbook cells, styles, sheet order, widths, RTL metadata and real XLSX write/read round trips, with and without deductions.
- Exact server-rendered section and monthly tracking markup; section selection callbacks and tracking status cycles/permission guards.
- Fresh cache reuse, expiry after 30 seconds, filter/user isolation, invalidation, disabled queries and request cancellation using the actual TanStack Query client.
- Detail pagination beyond 1,000 answers, N/A status lookup overlap and status lookup failures.
- 121 expiry filter combinations, legacy fallback values, workbook output and XLSX round trips.
- All four checklist import formats, append counters, exact ordered database operation payloads, actual XLSX reading and write failure propagation. All writes in these tests use isolated mocks.
- Cairo month rollover, leap years and year boundaries.
- Existing SQL checks execute against isolated PostgreSQL/WASM, not production.

Final result: **144/144 tests passed across 29 files; strict TypeScript passed with zero errors; production build passed; `git diff --check` passed.**

Final commands:

```sh
SQOP_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js npm test
npx tsc --noEmit
npm run build
git diff --check
```

PGlite remains an optional external test runtime. No app dependency was added.

## Performance: interpretation

A local synthetic CPU comparison (2,400 visits / 80 branches / 24 months) measured approximately 154 ms before and 16 ms after indexing in one run. These are local computation times, not page-load times or a production SLA; they vary by machine and test load.

The dashboard browser chunk was 76.67 kB / 19.53 kB gzip before, versus 67.38 kB / 16.76 kB gzip in the final verified build (about 14% less gzip).

The reliable request-level improvements are independent initial requests, zero additional loader calls for unchanged fresh cached queries, stable detail cache entries and parallel answer/N/A lookups. Cold production loading still depends on authentication, network latency, database execution and browser rendering. A whole-page millisecond guarantee cannot be established from these local tests.

## Preview verification

Automated comparisons are not a real browser or a live database benchmark. No production data, schema, historic scores or historic NULL answers were modified. No live browser end-to-end timing or desktop Excel visual verification has been performed in this environment.

In Preview verify: first dashboard load; switching month/branch/program/scope; ranking and drilldowns; exports; tracking updates; returning within and after 30 seconds; create/edit/submit/reopen/delete followed by dashboard refresh; logout and another account; checklist import on disposable test data; expiry filtering/export. Compare network request count and page-ready timings on the same device/account/filters against the previous build. Do not use real checklists to test replace-import operations.

Deploy the complete patch together so query keys, invalidation and loaders stay compatible. Rollback is code-only to the previous complete version; no data rollback or SQL cleanup is needed.
