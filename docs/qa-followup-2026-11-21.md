# SQOP QA follow-up — approved application fixes

This release keeps the production N/A inheritance, Checklist workbook import, and database permissions unchanged. It contains no new SQL, migration or Supabase setup requirement.

| Area | Change |
| --- | --- |
| Audit answers | Retrying failed writes cannot replace a newer edit; simultaneous flushes share one save operation. |
| Active audit checklist | Load every page of active questions and scope headings to the audit program. |
| Audit list and export | Distinguish query failures from an empty list, allow retries, and recheck approval when exporting a bulk archive. |
| Audit reports | Preserve access to the current report with a note when the historical comparison cannot load. |
| Audit photos | View or download audit images through a server-verified session using existing audit visibility. Photo upload and deletion authorization is unchanged. Successful uploads in a batch remain visible when another file fails. |
| Login and registration | Wait for the client before accepting form submissions. |

QA uses synthetic records and storage fixtures. Run `npm run check`, `npm test`, and `npm run build`. Optional PostgreSQL-based suites can be enabled with `SQOP_PGLITE_MODULE`; the optional workbook-specific cases need their input files. Real recovery email and writes to production audit records are outside these tests.

Keep public R2 access disabled once the authenticated photo route is verified on the deployed application. Existing public R2 links remain usable until public access to the bucket is disabled.
