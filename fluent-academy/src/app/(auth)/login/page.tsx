import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/auth-forms";
import { getCurrentUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  if (await getCurrentUser()) redirect(typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
  return (
    <>
      <h1 className="display text-3xl">Welcome back</h1>
      <p className="mt-2 text-muted">Log in to continue where you left off.</p>
      <div className="mt-8">
        <LoginForm next={typeof next === "string" ? next : undefined} />
      </div>
      <p className="mt-8 text-center text-sm text-muted">
        New to Fluent Academy?{" "}
        <Link href="/signup" className="font-medium text-navy-800 hover:underline">Create an account</Link>
      </p>
    </>
  );
}
