import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { KpmgLogo } from "@/components/ui/KpmgLogo";
import { Label } from "@/components/ui/Label";
import { useAuth } from "@/hooks/useAuth";

export function LoginPage() {
  const { me, login, signInWithSso } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void signInWithSso();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (me) {
    const to = (location.state as { from?: Location } | null)?.from?.pathname ?? "/";
    return <Navigate to={to} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{
        background:
          "radial-gradient(ellipse at top, rgba(0,145,218,0.20) 0%, rgba(0,51,141,0.10) 40%, rgba(248,250,252,1) 75%)",
      }}
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-card"
        data-testid="login-form"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex items-center gap-2 rounded-lg bg-brand-dark px-3 py-2 text-white">
            <KpmgLogo size="sm" />
          </div>
          <p className="mt-4 text-xs uppercase tracking-[0.18em] text-slate-500">KPMG</p>
          <h1 className="text-xl font-semibold text-brand">Finance Invoicing Agent</h1>
          <p className="mt-1 text-xs text-slate-500">Sign in to continue</p>
        </div>

        <div className="mb-4">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            data-testid="login-username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="mb-4">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            data-testid="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {error && <p className="mb-3 text-sm text-red-600" data-testid="login-error">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit">
          {loading ? "Signing in…" : "Sign in"}
        </Button>
        <p className="mt-6 text-center text-xs text-slate-500">
          Demo: <code className="font-mono">admin / Admin!pass123</code>
          {" "}or{" "}
          <code className="font-mono">officer / Officer!pass123</code>
        </p>
      </form>
    </div>
  );
}
