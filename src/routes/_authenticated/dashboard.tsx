import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  FilePlus2,
  FileCheck2,
  MessageSquare,
  Store,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronDown,
  X,
  FileSpreadsheet,
  Printer,
  Layers,
  ExternalLink,
  ShieldAlert,
  FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DASHBOARD_PROGRAM_IDS,
  auditMonthKey,
  cleanSectionName,
  compliancePercentage,
  formatAuditComment,
  maxQuestionScore,
  numericScore,
  programFromAuditTypeId,
} from "@/lib/dashboard/metrics";

const { FS: FS_TYPE_ID, GHP: GHP_TYPE_ID, FSMS: FSMS_TYPE_ID } = DASHBOARD_PROGRAM_IDS;

const PROGRAM_LABELS = {
  FS: "مؤشرات أقسام سلامة الغذاء — Food Safety",
  GHP: "مؤشرات أقسام النظافة والممارسات الصحية — GHP",
  FSMS: "مؤشرات أقسام أنظمة سلامة الغذاء — FSMS",
} as const;

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم والتحليلات — SBAS" },
      { name: "description", content: "Executive Food Safety Quality Dashboard." },
      { property: "og:title", content: "لوحة التحكم والتحليلات — SBAS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ExecutiveDashboard,
});

function ExecutiveDashboard() {
  const { profile, isAdmin } = useSession();

  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [branchSearch, setBranchSearch] = useState("");

  const [recentBranchFilter, setRecentBranchFilter] = useState<string>("all");
  const [recentMonthFilter, setRecentMonthFilter] = useState<string>("");

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  const toggleNode = (nodeKey: string) => {
    setExpandedNodes((prev) => ({ ...prev, [nodeKey]: !prev[nodeKey] }));
  };

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-data-full"],
    queryFn: async () => {
      const [
        auditsRes,
        branchesRes,
        sectionsRes,
        questionsRes,
        answersRes,
        auditTypesRes,
        profilesRes,
      ] = await Promise.all([
        supabase.from("audits").select("*").order("audit_date", { ascending: false }),
        supabase.from("branches").select("*").order("name_ar"),
        supabase.from("sections").select("*").order("order_index"),
        supabase.from("questions").select("*"),
        (async () => {
          const pageSize = 1000;
          const rows: any[] = [];
          for (let from = 0; ; from += pageSize) {
            const { data: page, error } = await supabase
              .from("audit_answers")
              .select("*")
              .range(from, from + pageSize - 1);
            if (error) throw error;
            rows.push(...(page ?? []));
            if (!page || page.length < pageSize) break;
          }
          return { data: rows, error: null };
        })(),
        supabase.from("audit_types").select("*"),
        supabase.from("profiles").select("id, full_name, email"),
      ]);

      const branches = branchesRes.data ?? [];
      const auditTypes = auditTypesRes.data ?? [];
      const profiles = profilesRes.data ?? [];

      const branchMap = new Map(branches.map((b) => [b.id, b]));
      const typeMap = new Map(auditTypes.map((t) => [t.id, t]));
      const profileMap = new Map(profiles.map((p) => [p.id, p.full_name || p.email || "—"]));

      const audits = (auditsRes.data ?? []).map((a) => ({
        ...a,
        branchName: branchMap.get(a.branch_id)?.name_ar || "فرع غير مسجل",
        branchCode: branchMap.get(a.branch_id)?.code || "—",
        typeName: typeMap.get(a.audit_type_id)?.name_ar || "سلامة الغذاء",
        typeCode: typeMap.get(a.audit_type_id)?.code || "FS",
        auditorName: profileMap.get(a.auditor_id) || "—",
      }));

      return {
        audits,
        branches,
        sections: sectionsRes.data ?? [],
        questions: questionsRes.data ?? [],
        answers: answersRes.data ?? [],
        auditTypes,
        profiles,
      };
    },
  });

  const filteredData = useMemo(() => {
    if (!data || !profile) return null;

    const userScopedAudits = data.audits.filter((a) => {
      if (isAdmin) return true;
      return a.auditor_id === profile.id;
    });

    const filteredAudits = userScopedAudits.filter((a) => {
      if (!a.audit_date) return true;
      if (startDate && a.audit_date < startDate) return false;
      if (endDate && a.audit_date > endDate) return false;
      return true;
    });

    const userSubmittedAudits = filteredAudits.filter((a) => a.status === "submitted");
    const draftsAudits = filteredAudits.filter((a) => a.status === "draft");
    const allowedBranchIds = new Set(filteredAudits.map((a) => a.branch_id));

    const allScopedAudits = data.audits.filter((a) => {
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
                }>;
              }
            >;
          }
        >;
      }
    > = {};

    data.sections.forEach((s) => {
      const program = programFromAuditTypeId(s.audit_type_id);
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
      if (ans.is_na) return;

      const audit = auditMap.get(ans.audit_id);
      if (!audit) return;

      const q = questionMap.get(ans.question_id);
      if (!q || !q.section_id) return;

      const sec = sectionMap.get(q.section_id);
      if (!sec || sec.audit_type_id !== audit.audit_type_id) return;

      const program =
        sec.audit_type_id === GHP_TYPE_ID
          ? "GHP"
          : sec.audit_type_id === FSMS_TYPE_ID
            ? "FSMS"
            : "FS";
      const key = `${program}__${sec.id}`;

      const secEntry = sectionDataMap[key];
      if (!secEntry) return;

      const maxScore = maxQuestionScore(q.max_score);
      const score = numericScore(ans.score);

      secEntry.earned += score;
      secEntry.possible += maxScore;

      const auditDate = audit.audit_date || "—";
      const monthKey = auditMonthKey(audit.audit_date);
      const branchId = audit.branch_id || "unknown";
      const branchName = audit.branchName || "فرع غير مسجل";

      if (!secEntry.months[monthKey]) {
        secEntry.months[monthKey] = { earned: 0, possible: 0, branches: {} };
      }
      const mObj = secEntry.months[monthKey];
      mObj.earned += score;
      mObj.possible += maxScore;

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
      bObj.earned += score;
      bObj.possible += maxScore;

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
        });
      }
    });

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

    const fsmsBranchScores = data.branches
      .filter((b) => isAdmin || allowedBranchIds.has(b.id))
      .map((b) => {
        const branchFsmsAudits = allSubmittedAudits.filter(
          (a) => a.branch_id === b.id && a.audit_type_id === FSMS_TYPE_ID,
        );
        const latestAudit = branchFsmsAudits[0];
        return {
          branchId: b.id,
          branchName: b.name_ar,
          branchCode: b.code || "—",
          score:
            (latestAudit as any)?.score != null
              ? Number((latestAudit as any).score)
              : (latestAudit as any)?.final_score != null
                ? Number((latestAudit as any).final_score)
                : null,
          auditDate: latestAudit?.audit_date || null,
          auditId: latestAudit?.id || null,
        };
      })
      .filter((item) => item.score !== null);

    const branchesToDisplay = isAdmin
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
    const overallScore = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 100;

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
      allSections: [...fsSections, ...ghpSections, ...fsmsSections],
      fsmsBranchScores,
      branchesSummary,
      submittedAuditIds: allSubmittedAuditIds,
    };
  }, [data, profile, isAdmin, startDate, endDate]);

  const filteredRecentAudits = useMemo(() => {
    if (!filteredData) return [];
    return filteredData.audits.filter((audit) => {
      if (recentBranchFilter !== "all" && audit.branch_id !== recentBranchFilter) {
        return false;
      }
      if (recentMonthFilter && !audit.audit_date?.startsWith(recentMonthFilter)) {
        return false;
      }
      return true;
    });
  }, [filteredData, recentBranchFilter, recentMonthFilter]);

  const activeSection = useMemo(() => {
    if (!activeSectionId || !filteredData) return null;
    return filteredData.allSections.find((s) => s.id === activeSectionId) || null;
  }, [activeSectionId, filteredData]);

  const activeBranch = useMemo(() => {
    if (!selectedBranchId || !filteredData) return null;
    return filteredData.branchesSummary.find((b) => b.id === selectedBranchId) || null;
  }, [selectedBranchId, filteredData]);

  const branchProgramsTree = useMemo(() => {
    if (!activeBranch || !filteredData || !data) return { foodSafety: [], ghp: [], fsms: [] };

    const branchSubmittedAudits = (activeBranch.audits || []).filter(
      (a: any) => a.status === "submitted",
    );
    const branchAuditMap = new Map(branchSubmittedAudits.map((a: any) => [a.id, a]));
    const branchAuditIds = new Set(branchSubmittedAudits.map((a: any) => a.id));

    const questionMap = new Map(data.questions.map((q) => [q.id, q]));
    const sectionMap = new Map(data.sections.map((s) => [s.id, s]));

    const buildTreeForProgram = (targetSectionTypeId: string) => {
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
        if (ans.is_na) return;

        const audit = branchAuditMap.get(ans.audit_id);
        if (!audit) return;

        const q = questionMap.get(ans.question_id);
        if (!q) return;
        const sec = sectionMap.get(q.section_id);
        if (!sec || sec.audit_type_id !== audit.audit_type_id) return;

        if (sec.audit_type_id !== targetSectionTypeId) return;

        const cleanSecName = cleanSectionName(sec.name_ar);
        const monthKey = auditMonthKey(audit.audit_date);
        const maxScore = maxQuestionScore(q.max_score);
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
        mObj.earned += score;
        mObj.possible += maxScore;

        if (!mObj.sections[cleanSecName]) {
          mObj.sections[cleanSecName] = {
            sectionName: cleanSecName,
            earned: 0,
            possible: 0,
            items: [],
          };
        }
        const sObj = mObj.sections[cleanSecName];
        sObj.earned += score;
        sObj.possible += maxScore;

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

      return Object.values(monthsMap)
        .map((m) => {
          const monthRate = compliancePercentage(m.earned, m.possible);
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
      foodSafety: buildTreeForProgram(FS_TYPE_ID),
      ghp: buildTreeForProgram(GHP_TYPE_ID),
      fsms: buildTreeForProgram(FSMS_TYPE_ID),
    };
  }, [activeBranch, filteredData, data]);

  const displayedBranches = useMemo(() => {
    if (!filteredData) return [];
    if (!branchSearch.trim()) return filteredData.branchesSummary;
    const term = branchSearch.toLowerCase();
    return filteredData.branchesSummary.filter(
      (b) =>
        (b.nameAr || "").toLowerCase().includes(term) ||
        (b.code || "").toLowerCase().includes(term),
    );
  }, [filteredData, branchSearch]);

  const exportToExcel = async () => {
    if (!filteredData || !data) return;

    const XLSX = await import("xlsx-js-style");

    const [genDeductionsRes, secDeductionsRes] = await Promise.all([
      supabase.from("audit_general_deductions").select("*"),
      supabase.from("audit_section_deductions").select("*"),
    ]);

    const genDeductions = genDeductionsRes.data ?? [];
    const secDeductions = secDeductionsRes.data ?? [];

    const wb = XLSX.utils.book_new();
    (wb as any).Workbook = {
      Views: [{ RTL: true }],
      Sheets: [],
    };

    const headerBlueStyle = {
      font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "003366" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "002244" } },
        bottom: { style: "thin", color: { rgb: "002244" } },
        left: { style: "thin", color: { rgb: "FFFFFF" } },
        right: { style: "thin", color: { rgb: "FFFFFF" } },
      },
    };

    const monthSeparatorStyle = {
      font: { name: "Calibri", sz: 13, bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "1F497D" } },
      alignment: { horizontal: "right", vertical: "center" },
      border: {
        top: { style: "medium", color: { rgb: "002244" } },
        bottom: { style: "medium", color: { rgb: "002244" } },
      },
    };

    const cellCenter = {
      font: { name: "Calibri", sz: 10, color: { rgb: "000000" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "E0E0E0" } },
        bottom: { style: "thin", color: { rgb: "E0E0E0" } },
        left: { style: "thin", color: { rgb: "E0E0E0" } },
        right: { style: "thin", color: { rgb: "E0E0E0" } },
      },
    };

    const cellLeft = {
      font: { name: "Calibri", sz: 10, color: { rgb: "000000" } },
      alignment: { horizontal: "right", vertical: "center" },
      border: cellCenter.border,
    };

    const cellCode = {
      font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "003366" } },
      alignment: { horizontal: "center", vertical: "center" },
      fill: { fgColor: { rgb: "F4F8FC" } },
      border: cellCenter.border,
    };

    const dynamicSections = [
      "الأسماك",
      "الجزارة",
      "الجبن",
      "المخبوزات",
      "الخضروات و الفاكهة",
      "الوجبات الجاهزة",
      "المبردات",
      "المجمدات",
      "البقالة الجافة",
      "الاستلامات",
      "عام",
      "التوصيل",
    ];

    const branchHeaders = [
      "Title (كود الفحص)",
      "Branch (الفرع)",
      "AuditDate (التاريخ)",
      "AuditType (نوع الفحص)",
      "Auditor (المراجع)",
      "BranchManager (مدير الفرع)",
      "Status (الحالة)",
      "TotalScore (الدرجة)",
      "MaxScore (القصوى)",
      "FinalPercentage (النسبة)",
      "GeneralDeduction (الخصم العام %)",
      "General Deduction Reason (سبب الخصم)",
      ...dynamicSections.map((s) => `قسم ${s}`),
    ];

    const wsBranchesData: Record<string, any> = {};
    const questionMap = new Map(data.questions.map((q) => [q.id, q]));
    const sectionMap = new Map(data.sections.map((s) => [s.id, s]));

    const auditScoresMap: Record<
      string,
      {
        earned: number;
        possible: number;
        secScores: Record<string, { earned: number; possible: number }>;
      }
    > = {};

    const discrepancyLog: Array<{
      auditCode: string;
      branchName: string;
      date: string;
      auditType: string;
      auditorName: string;
      sectionName: string;
      itemId: string;
      questionText: string;
      comment: string;
      score: number;
      maxScore: number;
    }> = [];

    data.answers.forEach((ans) => {
      if (!ans.audit_id || ans.is_na || ans.score === null) return;
      const q = questionMap.get(ans.question_id);
      if (!q) return;
      const sec = sectionMap.get(q.section_id);
      let secName = (sec?.name_ar || "عام").replace(/^قسم\s+/i, "").trim();

      if (!auditScoresMap[ans.audit_id]) {
        auditScoresMap[ans.audit_id] = { earned: 0, possible: 0, secScores: {} };
      }
      const aObj = auditScoresMap[ans.audit_id];
      const max = Number(q.max_score || 4);
      const scr = Number(ans.score);

      aObj.earned += scr;
      aObj.possible += max;

      if (!aObj.secScores[secName]) {
        aObj.secScores[secName] = { earned: 0, possible: 0 };
      }
      aObj.secScores[secName].earned += scr;
      aObj.secScores[secName].possible += max;

      if (scr < max) {
        const audit = data.audits.find((a) => a.id === ans.audit_id);
        const bCode = audit?.branchCode && audit.branchCode !== "—" ? audit.branchCode : "BR";
        const auditCode = `AUD-${bCode}-${(audit?.audit_date || "").replace(/-/g, "")}`;
        discrepancyLog.push({
          auditCode,
          branchName: audit?.branchName || "—",
          date: audit?.audit_date || "—",
          auditType: audit?.typeName || "سلامة الغذاء",
          auditorName: audit?.auditorName || "—",
          sectionName: secName,
          itemId: q.item_id || "—",
          questionText: q.text_ar || "بند الفحص",
          comment: ans.comment?.trim() || "خصم درجات (عدم مطابقة)",
          score: scr,
          maxScore: max,
        });
      }
    });

    const genDeductionMap: Record<string, { pct: number; reasons: string[] }> = {};
    genDeductions.forEach((gd) => {
      if (!genDeductionMap[gd.audit_id]) {
        genDeductionMap[gd.audit_id] = { pct: 0, reasons: [] };
      }
      genDeductionMap[gd.audit_id].pct += Number(gd.percentage || 0);
      if (gd.reason_text?.trim()) {
        genDeductionMap[gd.audit_id].reasons.push(gd.reason_text.trim());
      }
    });

    const sectionIndicatorRows = (typeId: string) => {
      const submittedAudits = filteredData.audits.filter(
        (audit: any) => audit.status === "submitted" && audit.audit_type_id === typeId,
      );
      const auditIds = new Set(submittedAudits.map((audit: any) => audit.id));
      const bySection: Record<string, { name: string; earned: number; possible: number }> = {};

      data.sections
        .filter((section: any) => section.audit_type_id === typeId)
        .forEach((section: any) => {
          bySection[section.id] = {
            name: (section.name_ar || "قسم غير مسمى").replace(/^قسم\\s+/i, "").trim(),
            earned: 0,
            possible: 0,
          };
        });

      data.answers.forEach((answer: any) => {
        if (
          !answer.audit_id ||
          !auditIds.has(answer.audit_id) ||
          answer.is_na ||
          answer.score === null
        )
          return;
        const question = questionMap.get(answer.question_id);
        const section = question ? sectionMap.get(question.section_id) : null;
        if (!section || section.audit_type_id !== typeId || !bySection[section.id]) return;
        const maxScore = Number(question?.max_score || 4);
        bySection[section.id].earned += Number(answer.score);
        bySection[section.id].possible += maxScore;
      });

      return Object.values(bySection).map((row) => ({
        ...row,
        percentage: row.possible > 0 ? Math.round((row.earned / row.possible) * 100) : 0,
      }));
    };

    const programSectionSheets = [
      { code: "FS", typeId: FS_TYPE_ID },
      { code: "GHP", typeId: GHP_TYPE_ID },
      { code: "FSMS", typeId: FSMS_TYPE_ID },
    ];

    programSectionSheets.forEach(({ code, typeId }) => {
      const rows = sectionIndicatorRows(typeId);
      const sheetRows = [
        [PROGRAM_LABELS[code as keyof typeof PROGRAM_LABELS]],
        ["النسب محسوبة من التدقيقات المعتمدة فقط"],
        ["القسم", "الدرجة المحققة", "إجمالي الدرجة", "نسبة القسم"],
        ...rows.map((row) => [row.name, row.earned, row.possible, `${row.percentage}%`]),
      ];
      const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
      sheet["!cols"] = [{ wch: 38 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
      sheet["!freeze"] = { xSplit: 0, ySplit: 3 };
      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:D1");
      for (let row = range.s.r; row <= range.e.r; row += 1) {
        for (let col = range.s.c; col <= range.e.c; col += 1) {
          const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
          if (cell)
            cell.s = row < 3 ? monthSeparatorStyle : row === 2 ? headerBlueStyle : cellCenter;
        }
      }
      XLSX.utils.book_append_sheet(wb, sheet, `${code} - أقسام`);
    });

    const auditsByMonth: Record<string, any[]> = {};
    filteredData.audits.forEach((audit: any) => {
      const mKey = audit.audit_date ? audit.audit_date.slice(0, 7) : "غير محدد";
      if (!auditsByMonth[mKey]) auditsByMonth[mKey] = [];
      auditsByMonth[mKey].push(audit);
    });

    const sortedMonths = Object.keys(auditsByMonth).sort((a, b) => b.localeCompare(a));
    let bRowIdx = 1;
    const branchesMerges: any[] = [];

    sortedMonths.forEach((mKey) => {
      const monthAudits = auditsByMonth[mKey]!;
      const monthTitle = ` 📅 شهر: ${mKey} (إجما����ي ${monthAudits.length} زيارة) `;

      wsBranchesData[`A${bRowIdx}`] = { v: monthTitle, t: "s", s: monthSeparatorStyle };
      for (let c = 1; c < branchHeaders.length; c++) {
        wsBranchesData[`${XLSX.utils.encode_col(c)}${bRowIdx}`] = { v: "", s: monthSeparatorStyle };
      }
      branchesMerges.push({
        s: { r: bRowIdx - 1, c: 0 },
        e: { r: bRowIdx - 1, c: branchHeaders.length - 1 },
      });
      bRowIdx++;

      branchHeaders.forEach((hText, cIdx) => {
        const colLetter = XLSX.utils.encode_col(cIdx);
        wsBranchesData[`${colLetter}${bRowIdx}`] = { v: hText, t: "s", s: headerBlueStyle };
      });
      bRowIdx++;

      monthAudits.forEach((audit: any) => {
        const calc = auditScoresMap[audit.id] || { earned: 0, possible: 0, secScores: {} };
        const rawPct = calc.possible > 0 ? (calc.earned / calc.possible) * 100 : 0;
        const finalPct =
          audit.score !== null && audit.score !== undefined
            ? Number(audit.score)
            : Math.round(rawPct);

        const isPassed = finalPct >= 85;
        const scoreStyle = {
          ...cellCenter,
          font: { ...cellCenter.font, bold: true, color: { rgb: isPassed ? "006600" : "CC0000" } },
          fill: { fgColor: { rgb: isPassed ? "EBF7EB" : "FDEEEE" } },
        };

        const gDed = genDeductionMap[audit.id] || { pct: 0, reasons: [] };
        const bCode = audit.branchCode && audit.branchCode !== "—" ? audit.branchCode : "BR";
        const auditCode = `AUD-${bCode}-${(audit.audit_date || "").replace(/-/g, "")}-${String(audit.id).slice(0, 4).toUpperCase()}`;

        const rowValues: any[] = [
          { v: auditCode, s: cellCode },
          { v: audit.branchName || "—", s: cellLeft },
          { v: audit.audit_date || "—", s: cellCenter },
          { v: audit.typeName || "سلامة الغذاء", s: cellCenter },
          { v: audit.auditorName || "—", s: cellLeft },
          { v: audit.branch_manager || "—", s: cellLeft },
          { v: audit.status === "submitted" ? "Approved (معتمد)" : "Draft (مسودة)", s: cellCenter },
          { v: calc.earned, s: cellCenter },
          { v: calc.possible, s: cellCenter },
          { v: `${finalPct}%`, s: scoreStyle },
          {
            v: gDed.pct > 0 ? `${gDed.pct}%` : "0%",
            s: {
              ...cellCenter,
              font: {
                ...cellCenter.font,
                bold: gDed.pct > 0,
                color: { rgb: gDed.pct > 0 ? "CC0000" : "000000" },
              },
            },
          },
          { v: gDed.reasons.length > 0 ? gDed.reasons.join(" | ") : "—", s: cellLeft },
        ];

        dynamicSections.forEach((secTarget) => {
          const sData = Object.entries(calc.secScores).find(
            ([name]) => name.includes(secTarget) || secTarget.includes(name),
          );
          if (sData && sData[1].possible > 0) {
            const sPct = Math.round((sData[1].earned / sData[1].possible) * 100);
            rowValues.push({
              v: `${sPct}%`,
              s: {
                ...cellCenter,
                font: {
                  ...cellCenter.font,
                  bold: true,
                  color: { rgb: sPct >= 85 ? "006600" : "CC0000" },
                },
              },
            });
          } else {
            rowValues.push({ v: "N/A", s: cellCenter });
          }
        });

        rowValues.forEach((valObj, cIdx) => {
          const colLetter = XLSX.utils.encode_col(cIdx);
          wsBranchesData[`${colLetter}${bRowIdx}`] = {
            v: valObj.v,
            t: typeof valObj.v === "number" ? "n" : "s",
            s: valObj.s,
          };
        });

        bRowIdx++;
      });

      bRowIdx++;
    });

    wsBranchesData["!ref"] = `A1:${XLSX.utils.encode_col(branchHeaders.length - 1)}${bRowIdx}`;
    wsBranchesData["!cols"] = [
      { wch: 25 },
      { wch: 18 },
      { wch: 13 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 15 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 18 },
      { wch: 32 },
      ...dynamicSections.map(() => ({ wch: 13 })),
    ];
    wsBranchesData["!merges"] = branchesMerges;
    wsBranchesData["!views"] = [{ rightToLeft: true, RTL: true }];

    XLSX.utils.book_append_sheet(wb, wsBranchesData as any, "الفروع والزيارات");
    (wb as any).Workbook.Sheets.push({ name: "الفروع والزيارات", RTL: true });

    const executiveRows = [
      ["المؤشر", "القيمة"],
      ["إجمالي الزيارات", filteredData.totalAudits],
      ["الفحوصات المعتمدة", filteredData.submittedCount],
      ["المسودات", filteredData.draftsCount],
      ["متوسط الامتثال العام", `${filteredData.overallScore}%`],
      ["حالات عدم المطابقة", filteredData.totalComments],
      ["المخالفات الحرجة", filteredData.totalCritical],
      ["عدد الفروع", filteredData.totalBranches],
    ];
    const wsExecutive = XLSX.utils.aoa_to_sheet(executiveRows);
    wsExecutive["!cols"] = [{ wch: 28 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsExecutive, "الملخص التنفيذي");

    const sectionRows = [
      ["البرنامج", "القسم", "عدد الزيارات", "نسبة الامتثال", "حالات عدم المطابقة", "مخالفات حرجة"],
    ];
    filteredData.allSections.forEach((section) => {
      const visits = section.months.reduce((sum, month) => sum + month.branches.length, 0);
      sectionRows.push([
        section.program,
        section.nameAr,
        visits,
        `${section.complianceRate}%`,
        section.commentsCount,
        section.criticalCount,
      ]);
    });
    const wsSections = XLSX.utils.aoa_to_sheet(sectionRows);
    wsSections["!cols"] = [
      { wch: 14 },
      { wch: 32 },
      { wch: 15 },
      { wch: 16 },
      { wch: 22 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, wsSections, "مؤشرات الأقسام");

    const wsIssues = XLSX.utils.json_to_sheet(
      discrepancyLog.map((row) => ({
        "كود الفحص": row.auditCode,
        الفرع: row.branchName,
        التاريخ: row.date,
        البرنامج: row.auditType,
        المراجع: row.auditorName,
        القسم: row.sectionName,
        "كود البند": row.itemId,
        "نص البند": row.questionText,
        الملاحظة: row.comment,
        الدرجة: row.score,
        "الدرجة القصوى": row.maxScore,
        "نسبة البند": row.maxScore ? `${Math.round((row.score / row.maxScore) * 100)}%` : "0%",
      })),
    );
    wsIssues["!cols"] = [
      { wch: 24 },
      { wch: 20 },
      { wch: 14 },
      { wch: 18 },
      { wch: 20 },
      { wch: 28 },
      { wch: 16 },
      { wch: 45 },
      { wch: 36 },
      { wch: 12 },
      { wch: 16 },
      { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, wsIssues, "سجل الملاحظات");

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Executive_Quality_Dashboard_${dateStr}.xlsx`);
  };

  return (
    <AppShell
      title={`لوحة المتابعة والتحليلات — ${profile?.full_name || "إدارة الجودة"}`}
      subtitle={
        isAdmin
          ? "متابعة دقيقة لنسب الامتثال وملاحظات الفروع والأقسام بالشهور"
          : "الملخص العام ومؤشرات الأداء"
      }
      action={
        isAdmin && (
          <div className="flex items-center gap-2 print:hidden" dir="rtl">
            <Button
              onClick={exportToExcel}
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs font-bold shadow-sm"
            >
              <FileSpreadsheet className="size-3.5 text-emerald-600" /> تصدير Excel
            </Button>
            <Button
              onClick={() => window.print()}
              size="sm"
              className="h-8 gap-1.5 text-xs font-bold shadow-sm"
            >
              <Printer className="size-3.5" /> طباعة / PDF
            </Button>
          </div>
        )
      }
    >
      <div
        className="surface-card mb-5 p-3.5 rounded-xl border border-border flex flex-wrap items-center justify-between gap-3 print:hidden"
        dir="rtl"
      >
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-primary" />
          <span className="text-xs font-bold">فلترة الفترة الزمنية:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">من:</span>
            <Input
              type="date"
              className="h-7 w-32 text-xs"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">إلى:</span>
            <Input
              type="date"
              className="h-7 w-32 text-xs"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          {(startDate || endDate) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
              className="h-7 px-2 text-xs text-destructive"
            >
              <X className="size-3 ml-1" /> مسح
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3 print:hidden">
        <Button
          asChild
          size="sm"
          className="h-auto py-2.5 flex justify-between bg-primary text-primary-foreground shadow-sm rounded-lg"
        >
          <Link to="/audits/new">
            <span className="font-bold flex items-center gap-1.5 text-xs">
              <FilePlus2 className="size-4" /> بدء فحص جديد
            </span>
            <span className="text-[11px] opacity-80">تسجيل</span>
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-auto py-2.5 flex justify-between border-border rounded-lg bg-card"
        >
          <Link to="/audits" search={{ status: "draft" as const }}>
            <span className="font-bold flex items-center gap-1.5 text-xs">
              <ClipboardList className="size-4 text-amber-600" /> مسودات المتابعة
            </span>
            <Badge variant="secondary" className="text-xs px-2 py-0">
              {filteredData?.draftsCount ?? 0}
            </Badge>
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-auto py-2.5 flex justify-between border-border rounded-lg bg-card"
        >
          <Link to="/audits" search={{ status: "submitted" as const }}>
            <span className="font-bold flex items-center gap-1.5 text-xs">
              <FileCheck2 className="size-4 text-emerald-600" /> الفحوصات المعتمدة
            </span>
            <Badge variant="secondary" className="text-xs px-2 py-0">
              {filteredData?.submittedCount ?? 0}
            </Badge>
          </Link>
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <div className="surface-card p-3 text-center rounded-xl border border-border">
          <span className="text-[11px] text-muted-foreground">متوسط الامتثال العام</span>
          <div className="mt-1 text-xl font-black text-primary">
            {filteredData?.overallScore ?? 0}%
          </div>
        </div>

        <div className="surface-card p-3 text-center rounded-xl border border-border">
          <span className="text-[11px] text-muted-foreground">إجمالي الزيارات</span>
          <div className="mt-1 text-xl font-black">{filteredData?.totalAudits ?? 0}</div>
        </div>

        <div className="surface-card p-3 text-center rounded-xl border border-border">
          <span className="text-[11px] text-muted-foreground">فحوصات معتمدة</span>
          <div className="mt-1 text-xl font-black text-emerald-600">
            {filteredData?.submittedCount ?? 0}
          </div>
        </div>

        <div className="surface-card p-3 text-center rounded-xl border border-border">
          <span className="text-[11px] text-muted-foreground">قيد التنفيذ (مسودات)</span>
          <div className="mt-1 text-xl font-black text-amber-600">
            {filteredData?.draftsCount ?? 0}
          </div>
        </div>

        <div className="surface-card p-3 text-center rounded-xl border border-border">
          <span className="text-[11px] text-muted-foreground">حالات عدم مطابقة</span>
          <div className="mt-1 text-xl font-black text-indigo-600">
            {filteredData?.totalComments ?? 0}
          </div>
        </div>

        <div className="surface-card p-3 text-center rounded-xl border border-border">
          <span className="text-[11px] text-muted-foreground">مخالفات صريحة (حرجة)</span>
          <div className="mt-1 text-xl font-black text-destructive">
            {filteredData?.totalCritical ?? 0}
          </div>
        </div>
      </div>

      {isAdmin ? (
        <>
          <div className="mt-6 space-y-6">
            <div className="surface-card p-4 rounded-xl border border-border">
              <div
                className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5"
                dir="rtl"
              >
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-1.5 text-emerald-700">
                    <BarChart3 className="size-4" />
                    مؤشرات أقسام سلامة الغذاء — Food Safety (المعتمدة فقط)
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    اضغط على أي قسم لعرض نسب الشهور والفروع والملاحظات بالتفصيل
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs bg-emerald-50 text-emerald-800 border-emerald-300"
                >
                  {filteredData?.fsSections?.length ?? 0} أقسام
                </Badge>
              </div>

              {isLoading ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  جاري تحميل البيانات...
                </p>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredData?.fsSections.map((sec) => (
                    <SectionCard
                      key={sec.id}
                      sec={sec}
                      onSelect={() => setActiveSectionId(sec.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="surface-card p-4 rounded-xl border border-border">
              <div
                className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5"
                dir="rtl"
              >
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-1.5 text-indigo-700">
                    <BarChart3 className="size-4" />
                    مؤشرات أقسام النظافة والممارسات الصحية — GHP (المعتمدة فقط)
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    مؤشرات الأقسام التابعة لتدقيق الـ GHP
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs bg-indigo-50 text-indigo-800 border-indigo-300"
                >
                  {filteredData?.ghpSections?.length ?? 0} أقسام
                </Badge>
              </div>

              {isLoading ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  جاري تحميل البيانات...
                </p>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredData?.ghpSections.map((sec) => (
                    <SectionCard
                      key={sec.id}
                      sec={sec}
                      onSelect={() => setActiveSectionId(sec.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="surface-card p-4 rounded-xl border border-border">
              <div
                className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5"
                dir="rtl"
              >
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-1.5 text-amber-700">
                    <BarChart3 className="size-4" />
                    مؤشرات أقسام FSMS (المعتمدة فقط)
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    تفصيل أقسام نظام إدارة سلامة الغذاء حسب الشهر والفرع
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs bg-amber-50 text-amber-800 border-amber-300"
                >
                  {filteredData?.fsmsSections?.length ?? 0} أقسام
                </Badge>
              </div>

              {isLoading ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  جاري تحميل البيانات...
                </p>
              ) : filteredData?.fsmsSections?.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  لا توجد بيانات أقسام FSMS مرتبطة بتدقيقات معتمدة.
                </p>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredData?.fsmsSections.map((sec) => (
                    <SectionCard
                      key={sec.id}
                      sec={sec}
                      onSelect={() => setActiveSectionId(sec.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="surface-card p-4 rounded-xl border border-border">
              <div
                className="mb-3 flex items-center justify-between border-b border-border pb-2.5"
                dir="rtl"
              >
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-1.5 text-amber-700">
                    <FileText className="size-4" />
                    نتائج تدقيق الدورة المستندية ونظام ISO 22000 — FSMS
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    درجة التقييم المعتمدة لكل فرع
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs bg-amber-50 text-amber-800 border-amber-300"
                >
                  {filteredData?.fsmsBranchScores.length ?? 0} فروع مدققة
                </Badge>
              </div>

              {filteredData?.fsmsBranchScores.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  لا توجد تقييمات معتمدة لتدقيق FSMS حتى الآن.
                </p>
              ) : (
                <div
                  className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                  dir="rtl"
                >
                  {filteredData?.fsmsBranchScores.map((b) => (
                    <div
                      key={b.branchId}
                      className="p-3 rounded-lg border border-border bg-card shadow-2xs flex justify-between items-center"
                    >
                      <div>
                        <span className="font-bold text-xs text-foreground block">
                          {b.branchName}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {b.auditDate || "—"}
                        </span>
                      </div>
                      <div className="text-left">
                        <span
                          className={`text-sm font-black font-mono px-2 py-0.5 rounded ${
                            (b.score ?? 0) >= 85
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          {b.score}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="surface-card mt-6 p-4 rounded-xl border border-border">
            <div
              className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5"
              dir="rtl"
            >
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  <Store className="size-4 text-primary" />
                  متابعة نشاط الفروع (اضغط لعرض البرامج والملاحظات بالشهور)
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  تقسيم برامج الفحص والنسب والملاحظات
                </p>
              </div>
              <div className="w-48 print:hidden">
                <Input
                  placeholder="بحث عن فرع..."
                  className="h-7 text-xs"
                  value={branchSearch}
                  onChange={(e) => setBranchSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {displayedBranches.map((branch) => (
                <div
                  key={branch.id}
                  onClick={() => setSelectedBranchId(branch.id)}
                  className="cursor-pointer flex flex-col justify-between p-3 rounded-lg bg-card border border-border shadow-xs hover:border-primary hover:shadow-sm transition-all active:scale-[0.99]"
                  dir="rtl"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-bold text-xs text-foreground block">
                        {branch.nameAr}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        الكود: {branch.code}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                      {branch.total} فحص
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-2 border-t border-border/60">
                    <span className="text-emerald-700 font-bold text-[10px]">
                      {branch.completed} معتمد
                    </span>

                    <span className="text-amber-700 font-bold text-[10px]">
                      {branch.drafts} مسودة
                    </span>

                    <span className="text-primary text-[10px] flex items-center font-bold">
                      تفاصيل <ChevronLeft className="size-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="surface-card mt-6 p-4 rounded-xl border border-border">
            <div className="mb-3 border-b border-border pb-2.5 space-y-2" dir="rtl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  <Calendar className="size-4 text-primary" />
                  سجل الفحوصات المسجلة
                </h3>
                <Button asChild variant="ghost" size="sm" className="print:hidden h-7 text-xs px-2">
                  <Link to="/audits">عرض الكل</Link>
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 print:hidden">
                <Select value={recentBranchFilter} onValueChange={setRecentBranchFilter}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="اختر الفرع" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="all">جميع الفروع</SelectItem>
                    {data?.branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-1.5">
                  <Input
                    type="month"
                    className="h-7 text-xs flex-1"
                    value={recentMonthFilter}
                    onChange={(e) => setRecentMonthFilter(e.target.value)}
                  />
                  {(recentBranchFilter !== "all" || recentMonthFilter) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRecentBranchFilter("all");
                        setRecentMonthFilter("");
                      }}
                      className="h-7 px-2 text-xs text-destructive"
                      title="مسح الفلاتر"
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {filteredRecentAudits.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  لا توجد فحوصات مسجلة.
                </p>
              ) : (
                filteredRecentAudits.map((audit: any) => (
                  <div
                    key={audit.id}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border/70 bg-card hover:bg-muted/20 transition-colors text-xs"
                    dir="rtl"
                  >
                    <div>
                      <span className="font-bold block">{audit.branchName}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {audit.audit_date}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={audit.status === "submitted" ? "default" : "outline"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {audit.status === "submitted" ? "مكتمل" : "مسودة"}
                      </Badge>
                      <Button
                        asChild
                        size="sm"
                        variant="ghost"
                        className="print:hidden h-6 text-xs px-2"
                      >
                        <Link
                          to={audit.status === "submitted" ? "/audits/$id/report" : "/audits/$id"}
                          params={{ id: audit.id }}
                        >
                          عرض
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : (
        <div
          className="mt-8 surface-card p-6 rounded-xl border border-dashed border-border text-center"
          dir="rtl"
        >
          <ShieldAlert className="size-8 text-muted-foreground mx-auto mb-2 opacity-60" />
          <h4 className="text-xs font-bold text-foreground">عرض مخصص للمفتشين</h4>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-md mx-auto">
            يتم عرض الملخص العام لزياراتك أعلاه، بينما التحليلات التفصيلية لمؤشرات الأقسام وأداء
            الفروع مقتصرة على حسابات الإدارة (Administrators).
          </p>
        </div>
      )}

      <Dialog open={!!activeSectionId} onOpenChange={(open) => !open && setActiveSectionId(null)}>
        <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto" dir="rtl">
          <DialogHeader className="text-right border-b border-border pb-3">
            <div className="flex justify-between items-center">
              <div>
                <DialogTitle className="text-base font-bold flex items-center gap-2 text-primary">
                  <Layers className="size-4" />
                  مؤشرات وتفاصيل قسم: {activeSection?.nameAr}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  نسب الامتثال وملاحظات عدم المطابقة مقسمة بالشهور والفروع
                </DialogDescription>
              </div>
              <Badge variant="outline" className="text-xs font-bold font-mono">
                الامتثال العام: {activeSection?.complianceRate}%
              </Badge>
            </div>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            {!activeSection?.months || activeSection.months.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                لا توجد فحوصات أو ملاحظات مسجلة لهذا القسم حتى الآن.
              </p>
            ) : (
              activeSection.months.map((mObj) => {
                const monthKey = `sec-month-${activeSection.id}-${mObj.monthKey}`;
                const isMonthOpen = expandedNodes[monthKey] ?? true;

                return (
                  <div
                    key={mObj.monthKey}
                    className="rounded-xl border border-border bg-card overflow-hidden"
                  >
                    <div
                      onClick={() => toggleNode(monthKey)}
                      className="cursor-pointer flex items-center justify-between p-3 bg-muted/40 hover:bg-muted/60 transition-colors border-b border-border/60 select-none"
                    >
                      <div className="flex items-center gap-2.5">
                        <Calendar className="size-4 text-primary" />
                        <span className="font-bold text-xs font-mono">شهر: {mObj.monthKey}</span>
                        <Badge
                          variant={mObj.complianceRate >= 85 ? "default" : "destructive"}
                          className="text-[10px] font-mono px-2 py-0"
                        >
                          نسبة امتثال الشهر: {mObj.complianceRate}%
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground font-semibold">
                          {mObj.branches.length} فروع
                        </span>
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform duration-200 ${isMonthOpen ? "rotate-180" : ""}`}
                        />
                      </div>
                    </div>

                    {isMonthOpen && (
                      <div className="p-3 space-y-2.5 bg-muted/10">
                        {mObj.branches.map((bObj) => {
                          const branchKey = `sec-br-${mObj.monthKey}-${bObj.branchId}`;
                          const isBranchOpen = expandedNodes[branchKey] ?? false;

                          return (
                            <div
                              key={bObj.branchId}
                              className="rounded-lg border border-border/80 bg-background overflow-hidden"
                            >
                              <div
                                onClick={() => toggleNode(branchKey)}
                                className="cursor-pointer flex items-center justify-between p-2.5 hover:bg-muted/30 transition-colors select-none"
                              >
                                <div className="flex items-center gap-2">
                                  <Store className="size-3.5 text-muted-foreground" />
                                  <span className="font-bold text-xs text-foreground">
                                    {bObj.branchName}
                                  </span>
                                  <span
                                    className={`text-[10px] font-bold font-mono px-1.5 py-0.2 rounded ${
                                      bObj.complianceRate >= 85
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-destructive/10 text-destructive"
                                    }`}
                                  >
                                    {bObj.complianceRate}% امتثال
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] py-0 px-1 font-mono"
                                  >
                                    {bObj.items.length} عدم مطابقة
                                  </Badge>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  {bObj.auditId && (
                                    <Button
                                      asChild
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 text-[10px] px-2 text-primary font-bold"
                                    >
                                      <Link to="/audits/$id/report" params={{ id: bObj.auditId }}>
                                        فتح التقرير <ExternalLink className="size-2.5 mr-1" />
                                      </Link>
                                    </Button>
                                  )}
                                  <ChevronDown
                                    className={`size-3.5 text-muted-foreground transition-transform duration-200 ${isBranchOpen ? "rotate-180" : ""}`}
                                  />
                                </div>
                              </div>

                              {isBranchOpen && (
                                <div className="p-2.5 border-t border-border/60 bg-muted/20 space-y-2">
                                  {bObj.items.length === 0 ? (
                                    <p className="text-[11px] text-emerald-700 font-semibold text-center py-1">
                                      ✓ هذا القسم مطابق تماماً ولم تسجل أي حالات عدم مطابقة.
                                    </p>
                                  ) : (
                                    bObj.items.map((item, itIdx) => (
                                      <div
                                        key={itIdx}
                                        className="p-2 rounded border border-border/70 bg-card text-xs space-y-1"
                                      >
                                        <div className="flex justify-between items-center">
                                          <span className="font-mono text-[10px] bg-muted px-1.5 py-0.2 rounded border border-border">
                                            {item.itemId}
                                          </span>
                                          <span className="font-mono text-[10px] text-destructive font-bold">
                                            الدرجة: {item.score} / {item.maxScore}
                                          </span>
                                        </div>
                                        <p className="font-semibold text-foreground text-[11px] leading-snug">
                                          {item.questionText}
                                        </p>
                                        <div className="p-1.5 bg-muted/40 rounded border border-border/40 text-[11px]">
                                          <span className="font-bold text-destructive block text-[10px]">
                                            الملاحظة:
                                          </span>
                                          {item.comment}
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedBranchId} onOpenChange={(open) => !open && setSelectedBranchId(null)}>
        <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto" dir="rtl">
          <DialogHeader className="text-right border-b border-border pb-3">
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-primary">
              <Store className="size-4" />
              متابعة نشاط وملاحظات: {activeBranch?.nameAr}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              كود الفرع: {activeBranch?.code} • إجمالي الفحوصات المعتمدة:{" "}
              {activeBranch?.completed ?? 0}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="fs" className="w-full mt-2" dir="rtl">
            <TabsList className="grid grid-cols-3 w-full bg-muted/60 h-8 p-0.5 rounded-lg">
              <TabsTrigger value="fs" className="text-xs py-1 font-bold">
                Food Safety
              </TabsTrigger>
              <TabsTrigger value="ghp" className="text-xs py-1 font-bold">
                GHP
              </TabsTrigger>
              <TabsTrigger value="fsms" className="text-xs py-1 font-bold">
                FSMS
              </TabsTrigger>
            </TabsList>

            {[
              { key: "fs", dataTree: branchProgramsTree.foodSafety, title: "Food Safety" },
              { key: "ghp", dataTree: branchProgramsTree.ghp, title: "GHP" },
              { key: "fsms", dataTree: branchProgramsTree.fsms, title: "FSMS" },
            ].map((prog) => (
              <TabsContent key={prog.key} value={prog.key} className="space-y-3 pt-2">
                {prog.dataTree.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    لا توجد فحوصات معتمدة مسجلة لبرنامج {prog.title} في هذا الفرع.
                  </p>
                ) : (
                  prog.dataTree.map((mGroup) => {
                    const mKey = `prog-${prog.key}-${mGroup.monthKey}`;
                    const isMOpen = expandedNodes[mKey] ?? true;

                    return (
                      <div
                        key={mGroup.monthKey}
                        className="rounded-xl border border-border bg-card overflow-hidden"
                      >
                        <div
                          onClick={() => toggleNode(mKey)}
                          className="cursor-pointer flex items-center justify-between p-3 bg-muted/40 hover:bg-muted/60 transition-colors border-b border-border/60 select-none"
                        >
                          <div className="flex items-center gap-2">
                            <Calendar className="size-4 text-primary" />
                            <span className="font-bold text-xs font-mono">
                              شهر: {mGroup.monthKey}
                            </span>
                            <Badge
                              variant={mGroup.complianceRate >= 85 ? "default" : "destructive"}
                              className="text-[10px] font-mono px-2 py-0"
                            >
                              نسبة الشهر: {mGroup.complianceRate}%
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2">
                            {mGroup.auditId && (
                              <Button
                                asChild
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px] px-2 text-primary font-bold"
                              >
                                <Link to="/audits/$id/report" params={{ id: mGroup.auditId }}>
                                  عرض التقرير <ExternalLink className="size-2.5 mr-1" />
                                </Link>
                              </Button>
                            )}
                            <ChevronDown
                              className={`size-4 text-muted-foreground transition-transform duration-200 ${isMOpen ? "rotate-180" : ""}`}
                            />
                          </div>
                        </div>

                        {isMOpen && (
                          <div className="p-3 space-y-2 bg-muted/10">
                            {mGroup.sections.map((sec) => {
                              const secNodeKey = `prog-sec-${prog.key}-${mGroup.monthKey}-${sec.sectionName}`;
                              const isSecOpen = expandedNodes[secNodeKey] ?? false;

                              return (
                                <div
                                  key={sec.sectionName}
                                  className="rounded-lg border border-border/80 bg-background overflow-hidden"
                                >
                                  <div
                                    onClick={() => toggleNode(secNodeKey)}
                                    className="cursor-pointer flex items-center justify-between p-2.5 hover:bg-muted/30 transition-colors select-none"
                                  >
                                    <div className="flex items-center gap-2">
                                      <Layers className="size-3.5 text-primary" />
                                      <span className="font-bold text-xs text-foreground">
                                        {sec.sectionName}
                                      </span>
                                      <span
                                        className={`text-[10px] font-bold font-mono px-1.5 py-0.2 rounded ${
                                          sec.complianceRate >= 85
                                            ? "bg-emerald-100 text-emerald-800"
                                            : "bg-destructive/10 text-destructive"
                                        }`}
                                      >
                                        {sec.complianceRate}% امتثال
                                      </span>
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] py-0 px-1 font-mono"
                                      >
                                        {sec.items.length} عدم مطابقة
                                      </Badge>
                                    </div>
                                    <ChevronDown
                                      className={`size-3.5 text-muted-foreground transition-transform duration-200 ${isSecOpen ? "rotate-180" : ""}`}
                                    />
                                  </div>

                                  {isSecOpen && (
                                    <div className="p-2.5 border-t border-border/60 bg-muted/20 space-y-2">
                                      {sec.items.length === 0 ? (
                                        <p className="text-[11px] text-emerald-700 font-semibold text-center py-1">
                                          ✓ هذا القسم ممتثل بالكامل (لا توجد أي بنود غير مطابقة).
                                        </p>
                                      ) : (
                                        sec.items.map((it, itIdx) => (
                                          <div
                                            key={itIdx}
                                            className="p-2 rounded border border-border/70 bg-card text-xs space-y-1"
                                          >
                                            <div className="flex justify-between items-center">
                                              <span className="font-mono text-[10px] bg-muted px-1.5 py-0.2 rounded border border-border">
                                                {it.itemId}
                                              </span>
                                              <span className="font-mono text-[10px] text-destructive font-bold">
                                                الدرجة: {it.score} / {it.maxScore}
                                              </span>
                                            </div>
                                            <p className="font-semibold text-foreground text-[11px] leading-snug">
                                              {it.questionText}
                                            </p>
                                            <div className="p-1.5 bg-muted/40 rounded border border-border/40 text-[11px]">
                                              <span className="font-bold text-destructive block text-[10px]">
                                                الملاحظة:
                                              </span>
                                              {it.comment}
                                            </div>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </TabsContent>
            ))}
          </Tabs>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function SectionCard({ sec, onSelect }: { sec: any; onSelect: () => void }) {
  return (
    <div
      onClick={onSelect}
      className="cursor-pointer rounded-lg border border-border bg-card p-3 shadow-xs hover:border-primary hover:shadow-sm transition-all active:scale-[0.99]"
      dir="rtl"
    >
      <div className="flex justify-between items-start mb-1.5">
        <span className="font-bold text-xs text-foreground">{sec.nameAr}</span>
        <span
          className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
            sec.complianceRate >= 90
              ? "bg-emerald-100 text-emerald-800"
              : sec.complianceRate >= 75
                ? "bg-amber-100 text-amber-800"
                : "bg-destructive/10 text-destructive"
          }`}
        >
          {sec.complianceRate}% امتثال
        </span>
      </div>

      <div className="my-2">
        <Progress value={sec.complianceRate} className="h-1.5" />
      </div>

      <div className="flex justify-between items-center text-[11px] pt-1.5 border-t border-border/50">
        <span className="flex items-center gap-1 text-muted-foreground font-semibold">
          <MessageSquare className="size-3 text-primary" /> {sec.commentsCount} عدم مطابقة
        </span>
        {sec.criticalCount > 0 ? (
          <span className="flex items-center gap-1 text-destructive font-semibold text-[10px]">
            <AlertTriangle className="size-3" /> {sec.criticalCount} حرجة
          </span>
        ) : (
          <span className="flex items-center gap-1 text-emerald-600 text-[10px]">
            <CheckCircle2 className="size-3" /> ممتثل
          </span>
        )}
      </div>
    </div>
  );
}
