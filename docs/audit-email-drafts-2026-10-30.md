# Approved audit email drafts

Adds a "تجهيز إيميل التقرير" button to submitted audit rows, the audit summary and the report page. It opens an editable subject/body preview following the supplied Arabic template: branch management greeting, optional delivery management greeting, audit type, audit month/year, final branch percentage, optional delivery percentage and closing. Percentage text is highlighted yellow in escaped RTL HTML.

The branch percentage comes from result.finalPercentage and delivery comes from result.delivery.percentage. It reuses existing scoring: normal branch delivery is separate and dark-store delivery is included in the final result. No new score calculations, answer writes, status mutations or database changes are introduced. Missing/NA/unscoreable delivery omits both delivery lines; an actual zero score remains 0%. Invalid dates/results or unresolved non-NA grades block draft preparation.

## What this version does
- Creates a downloadable RFC 5322/MIME .eml email file with plain-text and HTML alternatives and the actual audit PDF attached. X-Unsent marks it as unsent for clients that support it.
- Offers formatted clipboard copy plus separate PDF download for Outlook web/clients that do not open .eml as an editable draft.
- Lets the user enter optional To/CC addresses manually, with validation and deduplication. Addresses are held only in component memory, not saved to the database or browser storage.
- Rechecks the current submitted status and latest report before download or copy. Changed report data requires reviewing the refreshed preview. A synchronous lock prevents duplicate preparation operations.

## Boundaries and account behavior
This does NOT connect to Microsoft 365, create a draft inside the mailbox, authenticate a sender or send email. It does not log a report as sent, promise delivery or prevent repeat sends. Outlook desktop/new Outlook/web differ in their .eml behavior. The UI explains this and offers formatted copy/manual attachment as a fallback. The user must review From in Outlook and choose their work account before sending; no From identity is inferred from the app account, and no email credentials are requested.

Per-branch recipient defaults and an admin editor are deferred until the user supplies To/CC rules. Direct sending/mailbox drafts would require a separately configured Microsoft Graph/OAuth integration, with explicit permission and company support. This phase needs no database or secret/environment changes.

## Validation
306 tests across 63 files passed, including template content, type mapping, audit date versus current date, correct scoring/delivery behavior, genuine zero, NA omission, unsafe HTML/header rejection, draft-only restrictions and MIME/PDF serialization. TypeScript and production build/public credential scan passed. A separate Python email parser verified Arabic body/subject, RFC2231 Arabic attachment filename, unsent marker, recipient headers and exact PDF bytes. No mail was sent or mailbox changed. Outlook desktop behavior and browser UI acceptance remain unverified until Preview/user testing.
