import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Create Account — SAS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: RegisterPage,
});

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  fullName: z.string().trim().min(2, "Enter your full name").max(100),
});

function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = credentials.safeParse({ email, password, fullName });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid registration details");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: { emailRedirectTo: window.location.origin, data: { full_name: parsed.data.fullName } },
      });
      if (error) throw error;
      if (data.session) {
        navigate({ to: "/dashboard", replace: true });
      } else {
        toast.success("Account created — check your email to confirm it");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create account");
    } finally {
      setLoading(false);
    }
  };

  return <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10" dir="ltr">
    <section className="surface-card w-full max-w-sm p-5" aria-labelledby="register-title">
      <div className="mb-6 text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl brand-banner text-2xl font-bold">S</span><h1 id="register-title" className="mt-4 text-xl font-extrabold">Create Account</h1><p className="mt-1 text-sm text-muted-foreground">Authorized registration link</p></div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5"><Label htmlFor="register-name">Full Name</Label><Input id="register-name" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="register-email">Email</Label><Input id="register-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="register-password">Password</Label><Input id="register-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
        <Button type="submit" size="lg" disabled={loading}>{loading ? "Creating account..." : "Create Account"}</Button>
        <Button type="button" variant="ghost" onClick={() => navigate({ to: "/auth" })}>Back to sign in</Button>
      </form>
    </section>
  </main>;
}

export default RegisterPage;
