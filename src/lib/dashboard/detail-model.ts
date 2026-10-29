import type { DashboardData } from "./data";
import type { DashboardSnapshot } from "./snapshot";
import { snapshotSectionResult, snapshotAuditScore } from "./snapshot";
import {
  auditMonthKey,
  cleanSectionName,
  compliancePercentage,
  formatAuditComment,
  maxQuestionScore,
  numericScore,
  programFromAuditType,
} from "./metrics";

type DetailContext = {
  data: DashboardData | undefined;
  profile: { id: string } | null;
  snapshot: DashboardSnapshot | undefined;
  canViewAll: boolean;
  startDate: string;
  endDate: string;
  branchFilter: string;
};
export function buildDashboardDetails({
  data,
  profile,
  snapshot,
  canViewAll,
  startDate,
  endDate,
  branchFilter,
}: DetailContext) {
  if (!data || !profile || !snapshot) return null;

  const userScopedAudits = data.audits.filter((a) => {
    if (canViewAll) return true;
    return a.auditor_id === profile.id;
  });

  const filteredAudits = userScopedAudits.filter((a) => {
    if (branchFilter !== "all" && a.branch_id !== branchFilter) return false;
    if (!a.audit_date) return true;
    if (startDate && a.audit_date < startDate) return false;
    if (endDate && a.audit_date > endDate) return false;
    return true;
  });

  const userSubmittedAudits = filteredAudits.filter((a) => a.status === "submitted");
  const draftsAudits = filteredAudits.filter((a) => a.status === "draft");
  const allowedBranchIds = new Set(filteredAudits.map((a) => a.branch_id));

  const allScopedAudits = data.audits.filter((a) => {
    if (branchFilter !== "all" && a.branch_id !== branchFilter) return false;
    if (!a.audit_date) return true;
    if (startDate && a.audit_date < startDate) return false;
    if (endDate && a.audit_date > endDate) return false;
    return true;
  });

  const allSubmittedAudits = allScopedAudits.filter((a) => a.status === "submitted");
  const allSubmittedAuditIds = new Set(allSubmittedAudits.map((a) => a.id));

  const auditMap = new Map(data.audits.map((a) => [a.id, a]));
  const questionMap = new Map(data.questions.map((q) => [q.id, q]));
  const sectionMap = new Map(data.sections.map((s) => [s.id, s]));

  const sectionDataMap: Record<
    string,
    {
      id: string;
      nameAr: string;
      program: "FS" | "GHP" | "FSMS";
      auditTypeId: string;
      earned: number;
      possible: number;
      criticalCount: number;
      months: Record<
        string,
        {
          earned: number;
          possible: number;
          branches: Record<
            string,
            {
              branchId: string;
              branchName: string;
              earned: number;
              possible: number;
              auditId: string;
              items: Array<{
                auditId: string;
                date: string;
                itemId: string;
                questionText: string;
                comment: string;
                score: number | null;
                maxScore: number;
                sectionName: string;
              }>;
            }
          >;
        }
      >;
    }
  > = {};

  data.sections
    .filter((s) => data.auditTypes.some((type) => type.id === s.audit_type_id))
    .forEach((s) => {
      const program = programFromAuditType(
        data.auditTypes.find((type) => type.id === s.audit_type_id),
      );
      const key = `${program}__${s.id}`;

      sectionDataMap[key] = {
        id: s.id,
        nameAr: cleanSectionName(s.name_ar),
        program,
        auditTypeId: s.audit_type_id,
        earned: 0,
        possible: 0,
        criticalCount: 0,
        months: {},
      };
    });

  let totalNonCompliantItems = 0;
  let totalCritical = 0;

  data.answers.forEach((ans) => {
    if (!allSubmittedAuditIds.has(ans.audit_id)) return;
    if (ans.is_na || ans.score === null) return;

    const audit = auditMap.get(ans.audit_id);
    if (!audit) return;

    const q = questionMap.get(ans.question_id);
    if (!q || !q.section_id) return;

    const sec = sectionMap.get(q.section_id);
    if (!sec || sec.audit_type_id !== audit.audit_type_id) return;

    const program = programFromAuditType(
      data.auditTypes.find((type) => type.id === sec.audit_type_id),
    );
    const key = `${program}__${sec.id}`;

    const secEntry = sectionDataMap[key];
    if (!secEntry) return;

    const maxScore = maxQuestionScore(q.max_score, q.text_ar);
    const score = numericScore(ans.score);

    const auditDate = audit.audit_date || "—";
    const monthKey = auditMonthKey(audit.audit_date);
    const branchId = audit.branch_id || "unknown";
    const branchName = audit.branchName || "فرع غير مسجل";

    if (!secEntry.months[monthKey]) {
      secEntry.months[monthKey] = { earned: 0, possible: 0, branches: {} };
    }
    const mObj = secEntry.months[monthKey];

    if (!mObj.branches[branchId]) {
      mObj.branches[branchId] = {
        branchId,
        branchName,
        earned: 0,
        possible: 0,
        auditId: audit.id,
        items: [],
      };
    }
    const bObj = mObj.branches[branchId];

    if (score < maxScore) {
      totalNonCompliantItems += 1;
      if (score === 0) {
        secEntry.criticalCount += 1;
        totalCritical += 1;
      }

      bObj.items.push({
        auditId: audit.id,
        date: auditDate,
        itemId: q.item_id || "—",
        questionText: q.text_ar || "بند الفحص",
        comment: formatAuditComment(ans.comment),
        score: ans.score,
        maxScore,
        sectionName: cleanSectionName(sec.name_ar),
      });
    }
  });

  // Section cards and drilldowns use current RPC points after section deductions.
  // Raw answers above supply item-level findings only, not an alternative score.
  for (const audit of snapshot.audits) {
    if (!allSubmittedAuditIds.has(audit.id)) continue;
    for (const section of audit.sections) {
      const entry = Object.values(sectionDataMap).find((s) => s.id === section.id);
      const result = snapshotSectionResult(section);
      if (!entry || result.excluded || result.max <= 0) continue;
      const month = auditMonthKey(audit.date);
      entry.months[month] ??= { earned: 0, possible: 0, branches: {} };
      const m = entry.months[month];
      m.branches[audit.branchId] ??= {
        branchId: audit.branchId,
        branchName: audit.branchName,
        earned: 0,
        possible: 0,
        auditId: audit.id,
        items: [],
      };
      entry.earned += result.finalScore;
      entry.possible += result.max;
      m.earned += result.finalScore;
      m.possible += result.max;
      m.branches[audit.branchId]!.earned += result.finalScore;
      m.branches[audit.branchId]!.possible += result.max;
    }
  }

  const formatSections = (programType: "FS" | "GHP" | "FSMS") => {
    return Object.values(sectionDataMap)
      .filter((s) => s.program === programType)
      .map((s) => {
        const complianceRate = compliancePercentage(s.earned, s.possible);
        let notesCount = 0;

        const monthsList = Object.entries(s.months)
          .map(([monthKey, mVal]) => {
            const monthRate = compliancePercentage(mVal.earned, mVal.possible);
            const branchesList = Object.values(mVal.branches).map((b) => {
              const bRate = compliancePercentage(b.earned, b.possible);
              notesCount += b.items.length;
              return {
                ...b,
                complianceRate: bRate,
              };
            });

            return {
              monthKey,
              complianceRate: monthRate,
              branches: branchesList,
            };
          })
          .sort((a, b) => b.monthKey.localeCompare(a.monthKey));

        return {
          id: s.id,
          nameAr: s.nameAr,
          program: s.program,
          complianceRate,
          criticalCount: s.criticalCount,
          commentsCount: notesCount,
          months: monthsList,
        };
      });
  };

  const fsSections = formatSections("FS");
  const ghpSections = formatSections("GHP");
  const fsmsSections = formatSections("FSMS");

  const issueRecords = [...fsSections, ...ghpSections, ...fsmsSections].flatMap((section) =>
    section.months.flatMap((month) =>
      month.branches.flatMap((branch) =>
        branch.items.map((item) => ({
          ...item,
          branchId: branch.branchId,
          branchName: branch.branchName,
          monthKey: month.monthKey,
          program: section.program,
          sectionName: section.nameAr,
          sectionRate: section.complianceRate,
          branchRate: branch.complianceRate,
          critical: item.score === 0,
        })),
      ),
    ),
  );

  const fsmsBranchScores = data.branches
    .filter((b) => canViewAll || allowedBranchIds.has(b.id))
    .map((b) => {
      const branchFsmsAudits = allSubmittedAudits.filter(
        (a) =>
          a.branch_id === b.id &&
          programFromAuditType(data.auditTypes.find((type) => type.id === a.audit_type_id)) ===
            "FSMS",
      );
      const latestAudit = branchFsmsAudits[0];
      return {
        branchId: b.id,
        branchName: b.name_ar,
        branchCode: b.code || "—",
        score: (() => {
          const current = snapshot?.audits.find((audit) => audit.id === latestAudit?.id);
          return current ? (snapshotAuditScore(current)?.after ?? null) : null;
        })(),
        auditDate: latestAudit?.audit_date || null,
        auditId: latestAudit?.id || null,
      };
    })
    .filter((item) => item.score !== null);

  const branchesToDisplay = canViewAll
    ? data.branches
    : data.branches.filter((b) => allowedBranchIds.has(b.id));
  const branchAuditsMap: Record<string, any[]> = {};
  branchesToDisplay.forEach((b) => {
    branchAuditsMap[b.id] = [];
  });

  filteredAudits.forEach((a) => {
    if (a.branch_id && branchAuditsMap[a.branch_id]) {
      branchAuditsMap[a.branch_id]!.push(a);
    }
  });

  const branchesSummary = branchesToDisplay
    .map((b) => {
      const bAudits = branchAuditsMap[b.id] || [];
      return {
        id: b.id,
        nameAr: b.name_ar,
        code: b.code || "—",
        total: bAudits.length,
        completed: bAudits.filter((a) => a.status === "submitted").length,
        drafts: bAudits.filter((a) => a.status === "draft").length,
        audits: bAudits,
      };
    })
    .sort((a, b) => b.total - a.total);

  const totalEarned = Object.values(sectionDataMap).reduce((a, c) => a + c.earned, 0);
  const totalPossible = Object.values(sectionDataMap).reduce((a, c) => a + c.possible, 0);
  const overallScore =
    totalPossible > 0 ? Number(((totalEarned / totalPossible) * 100).toFixed(2)) : 100;

  return {
    audits: filteredAudits,
    submittedCount: userSubmittedAudits.length,
    draftsCount: draftsAudits.length,
    totalAudits: filteredAudits.length,
    totalBranches: branchesToDisplay.length,
    totalComments: totalNonCompliantItems,
    totalCritical,
    overallScore,
    fsSections,
    ghpSections,
    fsmsSections,
    issueRecords,
    allSections: [...fsSections, ...ghpSections, ...fsmsSections],
    fsmsBranchScores,
    branchesSummary,
    submittedAuditIds: allSubmittedAuditIds,
  };
}

export type DashboardDetails = NonNullable<ReturnType<typeof buildDashboardDetails>>;

export function buildBranchProgramsTree(
  activeBranch: DashboardDetails["branchesSummary"][number] | null,
  filteredData: DashboardDetails | null,
  data: DashboardData | undefined,
  snapshot: DashboardSnapshot | undefined,
) {
  if (!activeBranch || !filteredData || !data) return { foodSafety: [], ghp: [], fsms: [] };

  const branchSubmittedAudits = (activeBranch.audits || []).filter(
    (a: any) => a.status === "submitted",
  );
  const branchAuditMap = new Map(branchSubmittedAudits.map((a: any) => [a.id, a]));
  const branchAuditIds = new Set(branchSubmittedAudits.map((a: any) => a.id));

  const questionMap = new Map(data.questions.map((q) => [q.id, q]));
  const sectionMap = new Map(data.sections.map((s) => [s.id, s]));

  const buildTreeForProgram = (targetProgram: "FS" | "GHP" | "FSMS") => {
    const monthsMap: Record<
      string,
      {
        monthKey: string;
        earned: number;
        possible: number;
        auditId: string;
        sections: Record<
          string,
          {
            sectionName: string;
            earned: number;
            possible: number;
            items: any[];
          }
        >;
      }
    > = {};

    data.answers.forEach((ans) => {
      if (!branchAuditIds.has(ans.audit_id)) return;
      if (ans.is_na || ans.score === null) return;

      const audit = branchAuditMap.get(ans.audit_id);
      if (!audit) return;

      const q = questionMap.get(ans.question_id);
      if (!q) return;
      const sec = sectionMap.get(q.section_id);
      if (!sec || sec.audit_type_id !== audit.audit_type_id) return;

      const sectionProgram = programFromAuditType(
        data.auditTypes.find((type) => type.id === sec.audit_type_id),
      );
      if (sectionProgram !== targetProgram) return;

      const cleanSecName = cleanSectionName(sec.name_ar);
      const monthKey = auditMonthKey(audit.audit_date);
      const maxScore = maxQuestionScore(q.max_score, q.text_ar);
      const score = numericScore(ans.score);

      if (!monthsMap[monthKey]) {
        monthsMap[monthKey] = {
          monthKey,
          earned: 0,
          possible: 0,
          auditId: audit.id,
          sections: {},
        };
      }
      const mObj = monthsMap[monthKey];

      if (!mObj.sections[cleanSecName]) {
        mObj.sections[cleanSecName] = {
          sectionName: cleanSecName,
          earned: 0,
          possible: 0,
          items: [],
        };
      }
      const sObj = mObj.sections[cleanSecName];

      if (score < maxScore) {
        sObj.items.push({
          auditId: audit.id,
          date: audit.audit_date,
          itemId: q.item_id || "—",
          questionText: q.text_ar || "بند الفحص",
          comment: formatAuditComment(ans.comment),
          score: ans.score,
          maxScore,
        });
      }
    });

    const monthScores = new Map<string, number[]>();
    for (const audit of snapshot?.audits ?? []) {
      if (!branchAuditIds.has(audit.id) || programFromAuditType(audit.type) !== targetProgram)
        continue;
      const monthKey = auditMonthKey(audit.date);
      const auditScore = snapshotAuditScore(audit);
      if (auditScore)
        monthScores.set(monthKey, [...(monthScores.get(monthKey) ?? []), auditScore.after]);
      monthsMap[monthKey] ??= {
        monthKey,
        earned: 0,
        possible: 0,
        auditId: audit.id,
        sections: {},
      };
      const m = monthsMap[monthKey];
      for (const section of audit.sections) {
        const result = snapshotSectionResult(section);
        if (result.excluded || result.max <= 0) continue;
        const name = cleanSectionName(section.nameAr);
        m.sections[name] ??= { sectionName: name, earned: 0, possible: 0, items: [] };
        m.sections[name]!.earned += result.finalScore;
        m.sections[name]!.possible += result.max;
      }
    }

    return Object.values(monthsMap)
      .map((m) => {
        const values = monthScores.get(m.monthKey) ?? [];
        const monthRate = values.length
          ? Number((values.reduce((sum, n) => sum + n, 0) / values.length).toFixed(2))
          : 0;
        const sectionsList = Object.values(m.sections).map((s) => {
          const secRate = compliancePercentage(s.earned, s.possible);
          return {
            ...s,
            complianceRate: secRate,
          };
        });

        return {
          monthKey: m.monthKey,
          complianceRate: monthRate,
          auditId: m.auditId,
          sections: sectionsList,
        };
      })
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  };

  return {
    foodSafety: buildTreeForProgram("FS"),
    ghp: buildTreeForProgram("GHP"),
    fsms: buildTreeForProgram("FSMS"),
  };
}
