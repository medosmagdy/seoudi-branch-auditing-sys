import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { signInSchema, emailSchema, newPasswordSchema, authDestination } from "@/lib/auth-flow";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In — SQOP" },
      {
        name: "description",
        content: "Sign in to the Seoudi Quality Operating Platform to run food safety audits.",
      },
      { property: "og:title", content: "Sign In — SQOP" },
      { property: "og:description", content: "Access the Seoudi Quality Operating Platform." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { profile, error: sessionError, isPasswordRecovery, refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    const parsedEmail = emailSchema.safeParse(email);
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
    const parsed = newPasswordSchema.safeParse(password);
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

  useEffect(() => {
    if (isPasswordRecovery) setResetMode("update");
    const destination = authDestination(profile, isPasswordRecovery, resetMode);
    if (destination) void navigate({ to: destination, replace: true });
  }, [profile, isPasswordRecovery, resetMode, navigate]);

  const submit = async (e?: FormEvent) => {
    if (e) e.preventDefault();

    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid credentials");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
      if (error) throw error;
      if (data.session) await refresh();
      else toast.error("تعذر إنشاء جلسة تسجيل الدخول؛ أعد المحاولة");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="auth-theme flex min-h-screen items-center justify-center bg-background px-4 py-10"
      dir="ltr"
      lang="en"
    >
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <img
            src="/quality-assurance-logo.png"
            alt="Seoudi Quality Assurance"
            className="mx-auto h-20 w-32 object-contain"
          />
          <h1 className="mt-4 text-xl font-extrabold">Seoudi Quality Operating Platform</h1>
          <p className="text-xs text-muted-foreground">{"\n"}</p>
        </div>

        <div className="surface-card p-5">
          {sessionError && (
            <div
              role="alert"
              className="mb-4 space-y-2 rounded-lg border border-destructive/30 p-3 text-sm"
              dir="rtl"
            >
              <p>{sessionError}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
                إعادة تحميل الحساب
              </Button>
            </div>
          )}
          {resetMode === "request" ? (
            <form onSubmit={submitPasswordReset} className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">Reset password</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter your email to receive a secure reset link.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <Button className="w-full" size="lg" type="submit" disabled={loading}>
                {loading ? "Sending..." : "Send reset link"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setResetMode(null)}
              >
                Back to sign in
              </Button>
            </form>
          ) : resetMode === "update" ? (
            <form onSubmit={submitNewPassword} className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">Set a new password</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose a new password for your account.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <Button className="w-full" size="lg" type="submit" disabled={loading}>
                {loading ? "Updating..." : "Update password"}
              </Button>
            </form>
          ) : (
            <form onSubmit={(e) => submit(e)} className="flex flex-col gap-4">
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
              <button
                type="button"
                className="w-full text-center text-sm text-primary underline-offset-4 hover:underline"
                onClick={() => setResetMode("request")}
              >
                Forgot password?
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
