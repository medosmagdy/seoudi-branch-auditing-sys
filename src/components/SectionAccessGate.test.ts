import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactNode } from "react";
const state = vi.hoisted(() => ({
  role: "manager",
  pathname: "/slaughtering",
  scope: "branches",
  pending: false,
  error: false,
  allowed: false,
  childRenders: 0,
}));
vi.mock("@/hooks/useSession", () => ({ useSession: () => ({ profile: { role: state.role } }) }));
vi.mock("@/hooks/useSectionAccess", () => ({
  useSectionAccess: () => ({
    isPending: state.pending,
    isError: state.error,
    canSee: () => state.allowed,
    refetch: vi.fn(),
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => ({ pathname: state.pathname, search: { scope: state.scope } }),
}));
vi.mock("./AppShell", () => ({
  AppShell: ({ children, title }: { children: ReactNode; title: string }) =>
    createElement("div", null, createElement("h1", null, title), children),
}));
import { SectionAccessGate } from "./SectionAccessGate";
function Child() {
  state.childRenders++;
  return createElement("p", null, "protected content");
}
const render = () =>
  renderToStaticMarkup(createElement(SectionAccessGate, { children: createElement(Child) }));
beforeEach(() =>
  Object.assign(state, {
    role: "manager",
    pathname: "/slaughtering",
    scope: "branches",
    pending: false,
    error: false,
    allowed: false,
    childRenders: 0,
  }),
);
describe("section route guard", () => {
  it("does not mount the protected page on direct links when hidden", () => {
    expect(render()).toContain("السكشن غير متاح");
    expect(state.childRenders).toBe(0);
  });
  it("does not mount or fetch the page while access is unknown or failed", () => {
    state.pending = true;
    render();
    expect(state.childRenders).toBe(0);
    state.pending = false;
    state.error = true;
    expect(render()).toContain("تعذر التحقق");
    expect(state.childRenders).toBe(0);
  });
  it("mounts only after a positive grant", () => {
    state.allowed = true;
    expect(render()).toContain("protected content");
    expect(state.childRenders).toBe(1);
  });
  it("preserves administrator access during a section settings outage", () => {
    state.role = "admin";
    state.error = true;
    expect(render()).toContain("protected content");
  });
});
