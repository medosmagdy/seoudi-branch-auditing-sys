# NCRs Management and audit correction mail

## Access and activation

- NCRs Management uses the existing section visibility settings. Administrators can see it; other active users need an explicit grant from **الإدارة → ظهور السكاشن للمستخدمين** and access to the Audits section. Access to underlying audit records stays scoped to approved audits the viewer can see, including existing ownership, active sharing groups, and manager branch limits. The same rules are enforced when loading analysis data and recipient addresses.
- Correction email settings are managed separately in **الإدارة → مستلمو تقارير الفروع → مين يقدر يجهّز إيميل تعديل النتيجة؟**. No role or user starts enabled. Normal email settings and original report emails are independent. The correction button creates a draft with the currently approved result and regenerated audit PDF; it does not update the audit.
- Correction email requires the reviewed SQL proposal `supabase/proposals/2026-11-21_audit_correction_email_REVIEW_ONLY.sql`. It creates one private opt-in setting only. It does not change production audit or recipient tables. Without the setting, the correction button stays hidden. NCRs Management needs the already-installed section access and recipient features, not the new correction settings table.
- The two email flows produce .eml drafts for Outlook, with an attached PDF. The NCR draft starts with the branch's saved To list and an empty Cc. It sends nothing until the user reviews and sends in their mail client.

## Analysis rules

- The branch list represents branch audits (not Central Warehouses); includes approved FS and GHP only. Filters include calendar month, quarter, year and custom inclusive date ranges. A single program can be selected or both. Counts and averages are shown by program when both are selected.
- NCR cases are persisted, applicable checklist answers below their question maximum. A score of zero counts. A null, invalid score, a full score with a comment, or an excluded question/section does not count. Persisted invalid scores are flagged separately.
- The final score metric uses the saved, approved final score (`audits.score`); it does not calculate the dashboard weighted score. Records with no valid final score are excluded from that average. No audit score or status is recalculated by opening analysis.
- Repetition means at least two distinct audits for a topic. The analysis first recognizes specific, reviewable patterns in comments and otherwise uses matching question wording within a section. It does not infer closure or group ambiguous unrelated items. The detail view retains the checklist code, original note, grade, audit link, and date.
- The PDF is an executive summary, including the most frequent issues, suggestions and audit references. The full evidence stays in the app. No external service receives audit notes for grouping.
