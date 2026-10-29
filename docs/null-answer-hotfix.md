# NULL answer hotfix

Apply these files over Phase 3, preserving paths. Run npm test and npm run build, then deploy a Preview and verify before publishing. No SQL or historical data updates are included.

Fixes:
- Comments on untouched questions keep the configured maximum (normally 4).
- Leaving question N/A restores the maximum; explicitly selected zero is preserved.
- Answer writes run in order. Summary navigation waits for saves and retries failed latest writes; continued failure prevents navigation.
- Background reloads preserve local answer edits.
- Existing NULL/non-N/A answers are flagged in the runner. Submission is blocked with item identifiers before defaults and after the final read, excluding N/A sections and questions.
- Summary/report caches are invalidated before opening the summary.

Historical NULL scores are not guessed or modified. Open the affected question, explicitly select its verified score or N/A, wait for saving via the summary button, then submit when reviewed. Closing the browser during a network failure still risks unsaved edits; this patch does not add offline storage. Audit history duplication remains a separate unresolved investigation.

Validation: 57 tests passed; 7 PostgreSQL integration tests skipped without their isolated database configuration. Production database was not accessed. Vite build passed. Project TypeScript checks have existing errors.

Preview checks: untouched question + comment keeps full credit; N/A on/off returns full credit; select 0 + comment retains 0; immediately open summary and confirm latest edit; deny the answer write and confirm summary stays closed; legacy NULL shows item warning and blocks submission until explicitly reviewed.
