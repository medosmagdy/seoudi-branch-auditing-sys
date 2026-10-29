// Original workbook import operations from ChecklistManager at 5cafb64. Test only.
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
export type ChecklistImportContext = { typeId: string; sectionCount: number; questionCount: number };
export async function importChecklistWorkbook(workbook: XLSX.WorkBook, { typeId, sectionCount, questionCount }: ChecklistImportContext) {
      let secCounter = sectionCount;
      let qCounter = questionCount;
      let totalSections = 0;
      let totalQuestions = 0;

      // فحص نوع الملف بناء على محتواه
      const templateSheet = workbook.Sheets[workbook.SheetNames[0]!];
      const templateRows = templateSheet
        ? XLSX.utils.sheet_to_json<unknown[]>(templateSheet, { header: 1, defval: null })
        : [];
      const templateHeader = (templateRows[0] ?? []).map((cell) =>
        String(cell ?? "")
          .trim()
          .toLowerCase(),
      );
      const isChecklistTemplate = ["title", "department", "header", "itemtext", "maxscore"].every(
        (column) => templateHeader.includes(column.toLowerCase()),
      );
      const isFSMS =
        workbook.SheetNames.length === 1 &&
        workbook.Sheets["Sheet1"] &&
        JSON.stringify(XLSX.utils.sheet_to_json(workbook.Sheets["Sheet1"])).includes("22000");

      const isGHP = workbook.SheetNames.some(
        (s) =>
          s.includes("بقالة") || s.includes("جزارة و اسماك") || s.includes("المبيعات المشتركة"),
      );

      // ----------------------------------------------------
      // الحالة 0: تمبلت Checklist_Master الموحد
      // ----------------------------------------------------
      if (isChecklistTemplate) {
        const columnIndex = new Map(templateHeader.map((column, index) => [column, index]));
        const titleIndex = columnIndex.get("title")!;
        const departmentIndex = columnIndex.get("department")!;
        const headerIndex = columnIndex.get("header")!;
        const itemTextIndex = columnIndex.get("itemtext")!;
        const maxScoreIndex = columnIndex.get("maxscore")!;
        const sectionsByName = new Map<string, string>();
        const headersBySection = new Map<string, string>();
        let questionOrder = qCounter;

        for (const row of templateRows.slice(1)) {
          const title = String(row[titleIndex] ?? "").trim();
          const department = String(row[departmentIndex] ?? "").trim();
          const header = String(row[headerIndex] ?? "").trim();
          const itemText = String(row[itemTextIndex] ?? "").trim();
          if (!department || !itemText) continue;

          let sectionId = sectionsByName.get(department);
          if (!sectionId) {
            const { data: section } = await supabase
              .from("sections")
              .insert({
                audit_type_id: typeId,
                name_ar: department,
                order_index: secCounter++,
                is_delivery: false,
                active: true,
              } as never)
              .select("id")
              .single();
            if (!section) continue;
            sectionId = section.id;
            sectionsByName.set(department, sectionId);
            totalSections++;
          }

          const headerKey = `${sectionId}:${header}`;
          let headerId = headersBySection.get(headerKey) ?? null;
          if (header && !headerId) {
            const { data: insertedHeader } = await supabase
              .from("headers")
              .insert({
                section_id: sectionId,
                label_ar: header,
                order_index: headersBySection.size,
              } as never)
              .select("id")
              .single();
            headerId = insertedHeader?.id ?? null;
            if (headerId) headersBySection.set(headerKey, headerId);
          }

          const parsedMaxScore = Number(row[maxScoreIndex]);
          await supabase.from("questions").insert({
            audit_type_id: typeId,
            section_id: sectionId,
            header_id: headerId,
            item_id: title || `ITEM-${totalQuestions + 1}`,
            text_ar: itemText,
            max_score: Number.isFinite(parsedMaxScore) && parsedMaxScore > 0 ? parsedMaxScore : 4,
            item_order: questionOrder++,
            active: true,
          } as never);
          totalQuestions++;
        }
      }
      // ----------------------------------------------------
      // الحالة 1: ملف FSMS (المواصفة والدورة المستندية)
      // ----------------------------------------------------
      else if (isFSMS) {
        const sheet = workbook.Sheets[workbook.SheetNames[0]!];
        const rows = XLSX.utils.sheet_to_json<any[]>(sheet!, { header: 1, defval: null });

        const { data: mainSec } = await supabase
          .from("sections")
          .insert({
            audit_type_id: typeId,
            name_ar: "الدورة المستندية ونظام سلامة الغذاء (FSMS)",
            order_index: secCounter++,
            is_delivery: false,
            active: true,
          } as never)
          .select("id")
          .single();

        if (mainSec) {
          totalSections++;
          let currentHeaderId: string | null = null;
          let hOrder = 0;

          for (let r = 7; r < rows.length; r++) {
            const row = rows[r];
            if (!row || row.length === 0) continue;
            const col0 = row[0] !== null ? String(row[0]).trim() : "";
            const col1 = row[1] !== null ? String(row[1]).trim() : "";
            const scoreRef =
              typeof row[2] === "number" ? row[2] : typeof row[3] === "number" ? row[3] : 4;

            // لو الصف عنوان رئيسي لمواصفة
            if (col0 && !row[2] && !row[3]) {
              const { data: hData } = await supabase
                .from("headers")
                .insert({
                  section_id: mainSec.id,
                  label_ar: `${col0} - ${col1}`,
                  order_index: hOrder++,
                } as never)
                .select("id")
                .single();
              currentHeaderId = hData?.id ?? null;
              continue;
            }

            const qText = col1 || (isNaN(Number(col0)) ? col0 : "");
            if (qText && qText.length > 3 && qText !== "بنود المراجعة") {
              await supabase.from("questions").insert({
                audit_type_id: typeId,
                section_id: mainSec.id,
                header_id: currentHeaderId,
                item_id: col0 && !isNaN(Number(col0)) ? `ISO-${col0}` : `DOC-${totalQuestions + 1}`,
                text_ar: qText,
                max_score: scoreRef,
                item_order: qCounter++,
                active: true,
              } as never);
              totalQuestions++;
            }
          }
        }
      }
      // ----------------------------------------------------
      // الحالة 2: ملف GHP (الممارسات الصحية والنظافة - جداول متجاورة)
      // ----------------------------------------------------
      else if (isGHP) {
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) continue;
          const rows = XLSX.utils.sheet_to_json<any[]>(sheet!, { header: 1, defval: null });
          if (!rows || rows.length < 5) continue;

          // البحث عن عناوين الأقسام الموجودة في الشيت (يدعم عمودين متجاورين في الشيت الواحد)
          let colSets: { startCol: number; name: string }[] = [];

          for (let r = 0; r < 8; r++) {
            const row = rows[r];
            if (!row) continue;
            for (let c = 0; c < row.length; c++) {
              const val = String(row[c] || "").trim();
              if (
                val.includes("قسم ") ||
                val.includes("النظافة العامة") ||
                val.includes("التجارة الالكترونية") ||
                val.includes("المبيعات المشتركة")
              ) {
                if (!colSets.some((cs) => cs.name === val)) {
                  colSets.push({ startCol: c, name: val.replace(/^[\d\s\-–]+/, "").trim() });
                }
              }
            }
          }

          if (colSets.length === 0) {
            colSets = [{ startCol: 0, name: sheetName.trim() }];
          }

          for (const cSet of colSets) {
            const isDelivery = /توصيل|تجارة الكترونية|الكترونية/i.test(cSet.name);
            const { data: secData } = await supabase
              .from("sections")
              .insert({
                audit_type_id: typeId,
                name_ar: cSet.name,
                order_index: secCounter++,
                is_delivery: isDelivery,
                active: true,
              } as never)
              .select("id")
              .single();

            if (!secData) continue;
            totalSections++;
            const sectionId = secData.id;
            let currentHeaderId: string | null = null;
            let hOrder = 0;

            for (let r = 6; r < rows.length; r++) {
              const row = rows[r];
              if (!row) continue;
              const cellScore = row[cSet.startCol];
              const cellItem = row[cSet.startCol + 2] || row[cSet.startCol + 1];
              const cellHeader = row[cSet.startCol + 3] || row[cSet.startCol + 4];

              if (cellHeader && typeof cellHeader === "string" && cellHeader.length > 2) {
                const { data: hData } = await supabase
                  .from("headers")
                  .insert({
                    section_id: sectionId,
                    label_ar: cellHeader.trim(),
                    order_index: hOrder++,
                  } as never)
                  .select("id")
                  .single();
                currentHeaderId = hData?.id ?? null;
              }

              const itemText = cellItem ? String(cellItem).trim() : "";
              if (
                itemText &&
                itemText.length > 2 &&
                itemText !== "البند" &&
                !itemText.includes("التقييم")
              ) {
                const isBadHabit =
                  itemText.includes("عادات خاطئة") || itemText.includes("العادات الخاطئة");
                await supabase.from("questions").insert({
                  audit_type_id: typeId,
                  section_id: sectionId,
                  header_id: currentHeaderId,
                  item_id: isBadHabit ? "GHP-HABIT" : `GHP-${totalQuestions + 1}`,
                  text_ar: itemText,
                  max_score: typeof cellScore === "number" ? cellScore : 4,
                  item_order: qCounter++,
                  active: true,
                } as never);
                totalQuestions++;
              }
            }
          }
        }
      }
      // ----------------------------------------------------
      // الحالة 3: ملف فحص الفروع العادي (Stores FS)
      // ----------------------------------------------------
      else {
        for (const sheetName of workbook.SheetNames) {
          if (
            sheetName.includes("البيانات") ||
            sheetName.toLowerCase().includes("data") ||
            sheetName.includes("الملخص")
          ) {
            continue;
          }
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) continue;
          const rows = XLSX.utils.sheet_to_json<any[]>(sheet!, { header: 1, defval: null });
          if (!rows || rows.length < 2) continue;

          let sectionRawTitle = rows[0]?.[0] ? String(rows[0][0]).trim() : sheetName.trim();
          const cleanSectionName =
            sectionRawTitle.replace(/^[\d\s\-–]+/, "").trim() || sheetName.trim();
          const isDelivery =
            /delivery|توصيل/i.test(cleanSectionName) || /delivery|توصيل/i.test(sheetName);

          const { data: sectionData } = await supabase
            .from("sections")
            .insert({
              audit_type_id: typeId,
              name_ar: cleanSectionName,
              order_index: secCounter++,
              is_delivery: isDelivery,
              active: true,
            } as never)
            .select("id")
            .single();

          if (!sectionData) continue;
          totalSections++;
          const sectionId = sectionData.id;
          let currentHeaderId: string | null = null;
          let headerOrder = 0;
          let itemIndex = 1;

          for (let r = 1; r < rows.length; r++) {
            const row = rows[r];
            if (!row || row.length === 0) continue;
            const col0 = row[0] !== null && row[0] !== undefined ? String(row[0]).trim() : "";
            const col1 = row[1] !== null && row[1] !== undefined ? String(row[1]).trim() : "";
            const col3 = row[3];
            const col4 = row[4];

            if (
              col0 === "البند" ||
              col1 === "البند" ||
              col0.includes("الاجمالي") ||
              col0.includes("اجمالي")
            )
              continue;
            if (!col0 && !col1 && typeof col3 === "number" && typeof col4 === "number") continue;

            const isSubHeader =
              (col0 && !col1 && col3 === null && col4 === null && isNaN(Number(col0))) ||
              (col1 && !col0 && col3 === null && col4 === null && isNaN(Number(col1)));

            if (isSubHeader) {
              const headerTitle = (col0 || col1).replace(/[:：]/g, "").trim();
              if (headerTitle.length > 2 && headerTitle !== "البند") {
                const { data: headerData } = await supabase
                  .from("headers")
                  .insert({
                    section_id: sectionId,
                    label_ar: headerTitle,
                    order_index: headerOrder++,
                  } as never)
                  .select("id")
                  .single();
                currentHeaderId = headerData?.id ?? null;
                continue;
              }
            }

            let questionText =
              col1 && col1 !== "البند" ? col1 : col0 && isNaN(Number(col0)) ? col0 : "";
            let maxScore =
              typeof col4 === "number" && col4 > 0
                ? col4
                : typeof col3 === "number" && col3 > 0
                  ? col3
                  : 4;

            if (questionText && questionText.length > 3) {
              await supabase.from("questions").insert({
                audit_type_id: typeId,
                section_id: sectionId,
                header_id: currentHeaderId,
                item_id: `FS-${totalSections}-${String(itemIndex++).padStart(2, "0")}`,
                text_ar: questionText,
                max_score: maxScore,
                item_order: qCounter++,
                active: true,
              } as never);
              totalQuestions++;
            }
          }
        }
      }

  return { totalSections, totalQuestions };
}

export async function importChecklistFile(file: File, context: ChecklistImportContext) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  return importChecklistWorkbook(workbook, context);
}
