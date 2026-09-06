import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardCheck, BarChart3, FileText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Seoudi Branch Auditing System" },
      {
        name: "description",
        content:
          "Food safety auditing app for Seoudi branches: dynamic weighted checklists, precise scoring and professional bilingual reports.",
      },
      { property: "og:title", content: "Seoudi Branch Auditing System" },
      {
        property: "og:description",
        content: "Food safety auditing app for Seoudi branches: dynamic weighted checklists, precise scoring and professional bilingual reports.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: ClipboardCheck,
    title: "Dynamic checklist",
    body: "Sections, headers and questions managed from the admin panel or imported from Excel.",
  },
  {
    icon: BarChart3,
    title: "Precise scoring",
    body: "Per-section internal deductions, a general deduction on the final result, and Delivery fully isolated.",
  },
  {
    icon: FileText,
    title: "Professional reports",
    body: "Matching PDF and Word files with photos and comments for every question.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background" dir="ltr">
      <header className="brand-banner">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <span className="grid size-10 place-items-center rounded-xl bg-secondary text-secondary-foreground text-lg font-bold">
            S
          </span>
          <div className="text-sm font-semibold leading-tight">
            Seoudi Branches Audit System
            <span className="block text-[11px] font-normal opacity-80">SBAS</span>
          </div>
          <div className="ml-auto">
            <Button asChild variant="secondary" size="sm">
              <Link to="/auth">Sign In</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        <section className="py-14 text-center sm:py-20">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            <ShieldCheck className="size-3.5" /> Food safety · 31 branches
          </span>
          <h1 className="mt-5 text-3xl font-extrabold leading-tight sm:text-5xl">
            Branch auditing, straight from the floor
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            A field tool for auditors: one section per screen, large scoring buttons, automatic draft saving and a
            final result calculated to Seoudi rules.
          </p>
          <div className="mt-7 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Start Auditing</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="surface-card p-5">
              <feature.icon className="size-6 text-primary" />
              <h2 className="mt-3 text-base font-bold">{feature.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
