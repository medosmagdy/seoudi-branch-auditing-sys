import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";

describe("audit PDF download names across every entry point", () => {
  it.each(["audits.index.tsx", "audits.$id.summary.tsx", "audits.$id.report.tsx"])(
    "uses the shared report name in %s",
    (route) => {
      const code = readFileSync(
        new URL(`../routes/_authenticated/${route}`, import.meta.url),
        "utf8",
      );
      const source = ts.createSourceFile(
        route,
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const sharedNames = new Set<string>();
      const downloads: ts.CallExpression[] = [];
      const isSharedName = (n: ts.Node) =>
        ts.isCallExpression(n) &&
        n.expression.getText(source) === "auditReportFileBase" &&
        n.arguments[0]?.getText(source) === "model";
      const visit = (node: ts.Node) => {
        if (ts.isVariableDeclaration(node) && node.initializer && isSharedName(node.initializer))
          sharedNames.add(node.name.getText(source));
        if (ts.isCallExpression(node) && node.expression.getText(source) === "downloadElementAsPdf")
          downloads.push(node);
        ts.forEachChild(node, visit);
      };
      visit(source);
      expect(downloads.length).toBeGreaterThan(0);
      for (const download of downloads) {
        const name = download.arguments[1]!;
        expect(isSharedName(name) || (ts.isIdentifier(name) && sharedNames.has(name.text))).toBe(
          true,
        );
      }
    },
  );
});
