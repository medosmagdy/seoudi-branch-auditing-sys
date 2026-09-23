import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In — SAS" },
      { name: "description", content: "Sign in to the Seoudi Auditing System to run food safety audits." },
      { property: "og:title", content: "Sign In — SAS" },
      { property: "og:description", content: "Access the Seoudi Auditing System." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

const credentials = z.object({
  email: z.string().trim().email({ message: "Enter a valid email address" }).max(255),
  password: z.string().min(8, { message: "Password must be at least 8 characters" }).max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState<"request" | "update" | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setResetMode("update");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const submitPasswordReset = async (event: FormEvent) => {
    event.preventDefault();
    const parsedEmail = z.string().trim().email({ message: "Enter a valid email address" }).safeParse(email);
    if (!parsedEmail.success) {
      toast.error(parsedEmail.error.issues[0]?.message ?? "Enter a valid email address");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(parsedEmail.data, {
        redirectTo: window.location.origin + "/auth",
      });
      if (error) throw error;
      toast.success("If this email exists, a password reset link has been sent.");
      setResetMode(null);
    } catch {
      toast.error("Unable to send the reset link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitNewPassword = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = z.string().min(8, { message: "Password must be at least 8 characters" }).max(72).safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid password");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: parsed.data });
      if (error) throw error;
      toast.success("Password updated successfully.");
      setPassword("");
      setResetMode(null);
      await supabase.auth.signOut();
    } catch {
      toast.error("Unable to update the password. Please use a fresh reset link.");
    } finally {
      setLoading(false);
    }
  };

  const submit = async (mode: "signin" | "signup", e?: FormEvent) => {
    if (e) e.preventDefault();

    const parsed = credentials.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid credentials");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          ...parsed.data,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim().slice(0, 100) },
          },
        });
        if (error) throw error;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        navigate({ to: "/dashboard", replace: true });
      } else {
        toast.success("Account created — check your email to confirm it");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10" dir="ltr">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl brand-banner text-2xl font-bold">
            S
          </span>
          <h1 className="mt-4 text-xl font-extrabold">Seoudi Auditing System</h1>
          <p className="text-xs text-muted-foreground">{"\n"}</p>
        </div>

        <div className="surface-card p-5">
          {resetMode === "request" ? (
            <form onSubmit={submitPasswordReset} className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">Reset password</h2>
                <p className="mt-1 text-sm text-muted-foreground">Enter your email to receive a secure reset link.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reset-email">Email</Label>
                <Input id="reset-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <Button className="w-full" size="lg" type="submit" disabled={loading}>
                {loading ? "Sending..." : "Send reset link"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setResetMode(null)}>
                Back to sign in
              </Button>
            </form>
          ) : resetMode === "update" ? (
            <form onSubmit={submitNewPassword} className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">Set a new password</h2>
                <p className="mt-1 text-sm text-muted-foreground">Choose a new password for your account.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>
              <Button className="w-full" size="lg" type="submit" disabled={loading}>
                {loading ? "Updating..." : "Update password"}
              </Button>
            </form>
          ) : (
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Create Account</TabsTrigger>
            </TabsList>

            {/* نموذج تسجيل الدخول */}
            <TabsContent value="signin" className="pt-4">
              <form onSubmit={(e) => submit("signin", e)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <Button className="w-full" size="lg" type="submit" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
                <button type="button" className="w-full text-center text-sm text-primary underline-offset-4 hover:underline" onClick={() => setResetMode("request")}>
                  Forgot password?
                </button>
              </form>
            </TabsContent>

            {/* نموذج إنشاء الحساب */}
            <TabsContent value="signup" className="pt-4">
              <form onSubmit={(e) => submit("signup", e)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email2">Email</Label>
                  <Input
                    id="email2"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password2">Password</Label>
                  <Input
                    id="password2"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <Button className="w-full" size="lg" type="submit" disabled={loading}>
                  {loading ? "Creating account..." : "Create Account"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  The first account created becomes the system administrator.
                </p>
              </form>
            </TabsContent>
          </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
