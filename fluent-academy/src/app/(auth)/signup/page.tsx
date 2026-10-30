import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/auth-forms";
import { getCurrentUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <>
      <h1 className="display text-3xl">Start learning</h1>
      <p className="mt-2 text-muted">Create a free account. You&apos;ll choose your language and level next.</p>
      <div className="mt-8">
        <SignupForm />
      </div>
      <p className="mt-8 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-navy-800 hover:underline">Log in</Link>
      </p>
    </>
  );
}
