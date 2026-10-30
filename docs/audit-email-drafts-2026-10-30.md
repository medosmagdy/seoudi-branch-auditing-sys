# Approved audit email drafts

Adds a "تجهيز إيميل التقرير" button to submitted audit rows, the audit summary and the report page. It opens an editable subject/body preview following the supplied Arabic template: branch management greeting, optional delivery management greeting, audit type, audit month/year, final branch percentage, optional delivery percentage and closing. Percentage text is highlighted yellow in escaped RTL HTML.

The branch percentage comes from result.finalPercentage and delivery comes from result.delivery.percentage. It reuses existing scoring: normal branch delivery is separate and dark-store delivery is included in the final result. No new score calculations, answer writes, status mutations or database changes are introduced. Missing/NA/unscoreable delivery omits both delivery lines; an actual zero score remains 0%. Invalid dates/results or unresolved non-NA grades block draft preparation.

## What this version does
- Creates a downloadable RFC 5322/MIME .eml email file with plain-text and HTML alternatives and the actual audit PDF attached. X-Unsent marks it as unsent for clients that support it.
- Offers formatted clipboard copy plus separate PDF download for Outlook web/clients that do not open .eml as an editable draft.
- Loads private per-branch To/CC defaults when configured and permits per-message manual edits, with validation and deduplication. Per-message edits are kept only in component memory. The admin directory uses the separately proposed private table below.
- Rechecks the current submitted status and latest report before download or copy. Changed report data requires reviewing the refreshed preview. A synchronous lock prevents duplicate preparation operations.

## Boundaries and account behavior
This does NOT connect to Microsoft 365, create a draft inside the mailbox, authenticate a sender or send email. It does not log a report as sent, promise delivery or prevent repeat sends. Outlook desktop/new Outlook/web differ in their .eml behavior. The UI explains this and offers formatted copy/manual attachment as a fallback. The user must review From in Outlook and choose their work account before sending; no From identity is inferred from the app account, and no email credentials are requested.

Per-branch recipient defaults and an admin Excel import/editor are now implemented; their private database activation is pending explicit approval. Direct sending/mailbox drafts would require a separately configured Microsoft Graph/OAuth integration, with explicit permission and company support. No secret/environment changes are needed; activating private recipient defaults requires the isolated database proposal below.

## Validation
311 tests across 65 files passed (plus a separate private workbook verification; its optional fixture test is skipped without supplied environment paths), including template content, type mapping, audit date versus current date, correct scoring/delivery behavior, genuine zero, NA omission, unsafe HTML/header rejection, draft-only restrictions and MIME/PDF serialization. TypeScript and production build/public credential scan passed. A separate Python email parser verified Arabic body/subject, RFC2231 Arabic attachment filename, unsent marker, recipient headers and exact PDF bytes. No mail was sent or mailbox changed. Outlook desktop behavior and browser UI acceptance remain unverified until Preview/user testing.


## FSMS and private branch recipients update
FSMS now uses the supplied ISO22000:2018 document-review wording and the calendar quarter/year from the audit date (Jan–Mar Q1, Apr–Jun Q2, Jul–Sep Q3, Oct–Dec Q4). It does not include the branch/delivery greetings or delivery scores used by the monthly FS/GHP body. Maintenance email preparation is explicitly blocked until its separate template and recipients are supplied.

A new admin tab imports a three-column workbook (branch, To, CC), previews exact branch matches, supports corrections/manual per-branch editing and validates all rows before atomic save. Supplied Office-style display names are parsed into email addresses; addresses are deduplicated and To duplicates removed from CC. Blank rows are skipped and unmatched/ambiguous/duplicate branches block saving. Matching uses only canonical names and explicit known aliases, never fuzzy matches.

The user's workbook was privately validated: 32 unique branches/warehouse rows matched the live catalog, with 73 To and 207 CC entries after per-row deduplication. No actual recipient address, spreadsheet, import payload or private catalog fixture is committed to the public repository. Tests use example.com values; optional environment-based verification can process a private workbook locally.

### Database activation pending approval
Proposal: supabase/proposals/2026-10-30_branch_email_recipients_REVIEW_ONLY.sql. Adds one private table keyed by branch UUID and three RPCs: admin-only directory, admin-only atomic save, and audit-bound recipient lookup. The latter requires an active user with access to that submitted audit under existing admin/owner/assigned/shared/manager-branch rules; it also respects the hidden audits section and refuses maintenance. Anonymous execution and direct authenticated table access are denied. No audit tables, scores, roles, branch scopes or existing access policies are altered. No addresses are seeded by the public SQL.

The proposal has NOT been applied and the real lists have NOT been saved to production. After approval, apply only this proposal and privately import the validated workbook payload. The UI falls back to manual recipients when this RPC is not installed. If lookup fails for any other reason, preparation is blocked for retry instead of silently using a different branch's recipients. Runtime To/CC remain editable for each draft without changing the saved directory. FS, GHP and FSMS share this directory; maintenance never inherits it.
