# Maintenance report usability and PDF

The finding editor uses a calendar for new fault dates. Imported historical month/year or free-text values remain unchanged and visible until the user deliberately chooses a complete date or clears the field; no day is inferred or stored. The image picker is styled and still uses the existing authenticated Cloudflare upload flow.

The report modal now scrolls only its content so the close button remains visible; unsaved changes retain the existing close confirmation. Section tabs and status filters work together. All sections/all statuses remain the default. Excel and PDF use the same selected findings and only their images. Selecting a section pre-fills the section on a newly added finding. The branch report list has Excel and PDF buttons for each saved report; these exports include all sections and statuses. Before row-level PDF export the user can review or enter the manager names for that one file.

The PDF has a cover containing branch, inspection date, reviewer, branch manager, maintenance-area manager, status and the selected scope. It shows total findings, completed, exact «لم يتم», closure rate, plus new/in-progress and all unresolved counts. Detailed pages retain section, finding, status, severity, history, action, evidence, comments and images. R2-signed photo URLs are fetched unchanged and converted to embedded data URLs before rendering, avoiding signature breakage from the existing PDF renderer’s cache-busting. A missing/failed photo aborts export with an explicit error instead of silently creating an incomplete PDF. No audit PDF or scoring helper is modified.

## Optional persisted cover names — database proposal

`supabase/proposals/2026-10-31_maintenance_report_managers_REVIEW_ONLY.sql` adds two optional, default-empty text columns to `maintenance_reports`, updates the existing create/duplicate and save RPCs to preserve them, and keeps older clients compatible when fields are omitted. Existing report data, findings, statuses, scores and access policies are not changed. Existing full duplicates copy the names; the unfinished-note carryover copies them when the fields are available. Tests use isolated PGlite, including legacy-client saves and permissions.

The proposal is **not applied**. Until it is approved and applied, names entered in an open report are used for PDF export during that session but are not saved to the report; the UI explicitly explains this. Row-level PDF export also permits entering names for that file. Once the migration is enabled, the two fields are saved with the report. No environment variables or production data were changed for this PR.

## Verification

Baseline and regression tests passed, including 349 tests with the private reference workbook (one unrelated optional recipient fixture skipped), TypeScript, production build and the 72-asset credential boundary scan. Tests include status/section selection, carryover independence and cleanup, manager fields/old-client compatibility, cover metrics and names, signed image URL handling and explicit failure on unavailable images. Authenticated browser/PDF visual acceptance is still required in Preview: the separate cloud browser could not connect to the local-only synthetic preview, and no real report, image, or PDF was modified or sent in production.
