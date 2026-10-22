import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage(props: PageProps<"/reset-password">) {
  const { token } = await props.searchParams;
  return (
    <>
      <h1 className="display text-3xl">Choose a new password</h1>
      {typeof token === "string" && token.length > 10 ? (
        <>
          <p className="mt-2 text-muted">You&apos;ll be signed out on other devices after changing it.</p>
          <div className="mt-8">
            <ResetPasswordForm token={token} />
          </div>
        </>
      ) : (
        <p className="mt-4 text-muted">
          This link is missing its token. <Link href="/forgot-password" className="font-medium text-navy-800 underline">Request a new link</Link>.
        </p>
      )}
    </>
  );
}
