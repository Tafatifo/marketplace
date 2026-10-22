import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="container-page flex h-16 items-center justify-between">
          <Link href="/"><Logo /></Link>
        </div>
      </header>
      <main id="main" className="container-page py-10 sm:py-14">{children}</main>
    </div>
  );
}
