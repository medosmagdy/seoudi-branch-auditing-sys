import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MonthlyTrackingCard, type TrackingRow } from "@/components/dashboard/MonthlyTrackingCard";
import { SectionCard } from "@/components/dashboard/SectionCard";
import {
  MonthlyTrackingCard as BeforeTracking,
  SectionCard as BeforeSection,
} from "./__fixtures__/pre-refactor-ui";
function buttons(node: ReactNode): { disabled?: boolean; onClick: () => unknown }[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<{ children?: ReactNode; disabled?: boolean; onClick: () => unknown }>(node))
    return [];
  return [...(node.type === "button" ? [node.props] : []), ...buttons(node.props.children)];
}
const row: TrackingRow = {
  id: "saved",
  branch_name: "مدينتي",
  fs_status: "not_started",
  ghp_status: "in_progress",
  fsms_status: "completed",
};
describe("dashboard presentation and event behavior before and after", () => {
  it("preserves section content, thresholds and selection after the approved green redesign", () => {
    for (const complianceRate of [0, 74, 75, 89, 90, 100])
      for (const criticalCount of [0, 2]) {
        const props = {
          sec: { id: "s", nameAr: "قسم", complianceRate, criticalCount, commentsCount: 3 },
          onSelect: vi.fn(),
        };
        const current = renderToStaticMarkup(createElement(SectionCard, props));
        const previous = renderToStaticMarkup(createElement(BeforeSection, props));
        // Only the root is now a keyboard-accessible button with presentation classes.
        expect(SectionCard(props).type).toBe("button");
        expect(SectionCard(props).props.type).toBe("button");
        expect(current.replace(/^<button[^>]*>/, "").replace(/<\/button>$/, "")).toBe(
          previous.replace(/^<div[^>]*>/, "").replace(/<\/div>$/, ""),
        );
        SectionCard(props).props.onClick();
        expect(props.onSelect).toHaveBeenCalledOnce();
      }
  });
  it("preserves manual permissions and the three-state click cycle after the approved tracking redesign", () => {
    for (const canEdit of [true, false])
      for (const rows of [[], [row], [{ ...row, branch_name: "فرع مدينتي" }]]) {
        const update = vi.fn().mockResolvedValue(undefined);
        const beforeUpdate = vi.fn().mockResolvedValue(undefined);
        const props = { rows, canEdit, onUpdate: update };
        const html = renderToStaticMarkup(createElement(MonthlyTrackingCard, props));
        expect(html).toContain("المتابعة الشهرية");
        if (rows.length) expect(html).toContain(rows[0]!.branch_name);
        else expect(html).toContain("لا توجد فروع مطابقة");
        const current = buttons(MonthlyTrackingCard(props));
        const previous = buttons(BeforeTracking({ ...props, onUpdate: beforeUpdate }));
        current.forEach((button) => button.onClick());
        previous.forEach((button) => button.onClick());
        expect(update.mock.calls).toEqual(beforeUpdate.mock.calls);
        if (rows.length && canEdit)
          expect(update.mock.calls).toEqual([
            ["saved", "fs_status", "in_progress"],
            ["saved", "ghp_status", "completed"],
            ["saved", "fsms_status", "not_started"],
          ]);
        else expect(update).not.toHaveBeenCalled();
      }
  });
});
