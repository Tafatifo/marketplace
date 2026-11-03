import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";
import { emailDeliveryMode } from "@/server/env";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  const mode = emailDeliveryMode();
  return (
    <>
      <h1 className="display text-3xl">Forgot your password?</h1>
      <p className="mt-2 text-muted">Enter the email you signed up with and we&apos;ll send you a link to choose a new one.</p>
      {mode === "dev-log" && (
        <p className="mt-4 rounded-lg bg-gold-50 px-3 py-2 text-xs text-gold-700 ring-1 ring-gold-200">
          Development mode: no email server is configured, so reset emails appear in the{" "}
          <Link href="/dev/mailbox" className="font-semibold underline">development mailbox</Link>.
        </p>
      )}
      <div className="mt-8">
        <ForgotPasswordForm />
      </div>
      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-navy-800 hover:underline">Back to log in</Link>
      </p>
    </>
  );
}
