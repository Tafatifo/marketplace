"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";

function safeNext(next: string | null | undefined, fallback: string) {
  // Only allow same-site relative paths to prevent open redirects.
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-11" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-navy-900"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFields({});
    try {
      const res = await api<{ next: string }>("/api/auth/login", { body: { email, password } });
      router.replace(res.next === "/onboarding" ? "/onboarding" : safeNext(next, res.next));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fieldErrors());
        setError(err.status === 422 ? null : err.message);
      } else setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Email" error={fields.email}>
        {(p) => <Input {...p} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      <Field label="Password" error={fields.password}>
        {(p) => <PasswordInput {...p} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-navy-700 hover:text-navy-900 hover:underline">
          Forgot your password?
        </Link>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Log in
      </Button>
    </form>
  );
}

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agree) {
      setError("Please accept the terms and privacy policy to continue.");
      return;
    }
    setLoading(true);
    setError(null);
    setFields({});
    try {
      await api("/api/auth/signup", { body: { name, email, password } });
      router.replace("/onboarding");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const f = err.fieldErrors();
        if (err.code === "weak_password") f.password = err.message;
        setFields(f);
        setError(err.status === 422 ? null : err.message);
      } else setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const strength = password.length === 0 ? 0 : password.length < 10 ? 1 : password.length < 14 ? 2 : 3;

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Your name" error={fields.name}>
        {(p) => <Input {...p} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label="Email" error={fields.email}>
        {(p) => <Input {...p} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      <Field label="Password" hint="At least 10 characters. A short phrase is easier to remember." error={fields.password}>
        {(p) => <PasswordInput {...p} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <div className="-mt-2 flex gap-1.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${strength >= i ? (strength === 1 ? "bg-danger-600" : strength === 2 ? "bg-gold-500" : "bg-success-600") : "bg-navy-50"}`} />
        ))}
      </div>
      <label className="flex items-start gap-2.5 text-sm text-muted">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-navy-800" />
        <span>
          I agree to the{" "}
          <Link href="/terms" className="font-medium text-navy-800 underline">terms</Link> and{" "}
          <Link href="/privacy" className="font-medium text-navy-800 underline">privacy policy</Link>.
        </span>
      </label>
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Create account
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ message: string }>("/api/auth/forgot", { body: { email } });
      setSent(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-success-100 bg-success-50 p-5 text-sm text-success-700" role="status">
        <MailCheck className="mb-2 h-5 w-5" />
        <p className="font-medium">Check your inbox</p>
        <p className="mt-1">{sent} The link expires in one hour.</p>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Email">
        {(p) => <Input {...p} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Send reset link
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/reset", { body: { token, password } });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="New password" hint="At least 10 characters.">
        {(p) => <PasswordInput {...p} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <Field label="Confirm new password">
        {(p) => <PasswordInput {...p} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Set new password
      </Button>
    </form>
  );
}
