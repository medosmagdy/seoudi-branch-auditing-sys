# Per-user application sections — database activated 29 October 2026

## User-facing behavior
Administration → User management → ظهور السكاشن للمستخدمين. Select a user, then choose حسب الرتبة / ظاهر / مخفي per section and save. Existing role defaults remain until an explicit choice is saved. Admins always retain all sections and administration access.

Sections: audits (including new audit and report/summary routes), slaughterhouses, branch dashboard/monthly tracking, warehouse dashboard, expiry. The centralized APP_SECTIONS registry drives both administration options and route mapping; future sections need one registry entry with their route/default roles. No new SQL is needed for a newly registered section key.

Hidden sections disappear from navigation, and the parent route gate prevents their pages from mounting/fetching data on direct links. Unknown/failed access checks block non-admin content; a missing migration retains old defaults so applying code before SQL is safe. Settings refresh on focus and approximately every 30 seconds. Existing audit ownership, sharing, draft restrictions, branch scopes, scoring and N/A inheritance are unchanged. Auditor dashboard restrictions remain in force; showing a section does not grant a different role.

Anyone explicitly given slaughterhouse access can create reports, update drafts (same report workflow as the existing admin page), delete saved reports and their attachments after confirmation, and export. A deletion button is added in saved report details. Local bundled archive reports cannot be deleted from the running app. Storage cleanup failures retain the database report for retry; if multiple cleanup operations partly succeed before a failure, some images may already be gone. Database deletion of a report cascades its photo metadata via the existing foreign key.

## Production database/configuration scope approved and applied
File: supabase/proposals/2026-10-29_section_visibility_REVIEW_ONLY.sql

1. Add user_section_access(user_id, section_key, visible, updated_at, updated_by), with RLS and no direct anonymous/authenticated table access.
2. Add context and admin-only atomic save RPCs. Active accounts only. Ordinary users receive only their own overrides; only active admins see/edit user settings. Admin accounts cannot be restricted through this feature. No initial overrides are assigned to anyone.
3. Replace the inspected existing policies on slaughter_reports, slaughter_report_photos and slaughter_locations with full access for active admins or users explicitly granted slaughtering. Hidden/ungranted users have no access under these policies. Add table DELETE grants for authenticated requests, still gated by RLS.
4. Create the missing private audit-reports bucket (only if absent), matching the existing slaughter form. Add a storage.objects policy limited to audit-reports + slaughter/ paths + verified slaughter permission. No other bucket policies are changed.

No audit/audit_answers/photo tables are altered; no scores, roles, sharing memberships, manager scopes or existing production report rows are modified by this installer. It does not turn on RLS for the core audit tables, whose preexisting raw API access is outside this UI-visibility feature. Do not describe the other sections as newly secured at raw database API level. Slaughter access is enforced in its existing RLS layer.

The user explicitly approved this scope and the migration user_section_visibility_and_slaughter_access was applied successfully on 29 October 2026. Do not rerun the section SQL or older sharing/manager SQL proposals.

## Validation
293 tests passed across 61 files in the broad run. Four additional direct-link route-gate tests passed after that run; the final targeted run covers gate, scope defaults, SQL authorization and report cleanup. TypeScript and production build/public credential boundary passed. Isolated PGlite tests cover admin-only editing, private context, inactive/anonymous rejection, full report creation/deletion for a granted manager, storage path restriction and denial after resetting grants. No live production report or image was created/deleted. No browser acceptance test of the new admin form has been performed.

## Installation and activation
Apply the cumulative source ZIP over the current project and build/deploy through the usual workflow. Database activation is complete. Install/merge and deploy this code, then refresh and choose specific users/sections in administration. No overrides were assigned automatically.

Post-activation checks: RLS enabled on user_section_access; anonymous save execution and direct authenticated table reads denied; four slaughter policies installed; private audit-reports bucket exists; zero initial user overrides. Active admin context and slaughter access verified. No production reports/photos were created or deleted.
