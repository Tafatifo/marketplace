import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-navy-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_50%_at_80%_10%,rgb(194_155_63/0.22),transparent),radial-gradient(60%_60%_at_10%_90%,rgb(58_98_159/0.35),transparent)]" />
        <Link href="/" className="relative">
          <Logo inverted />
        </Link>
        <div className="relative max-w-md">
          <p className="font-serif text-3xl leading-snug text-white">
            “The goal isn&apos;t to know every rule. It&apos;s to open your mouth and be understood.”
          </p>
          <p className="mt-4 text-sm text-navy-300">The idea behind every Fluent Academy lesson.</p>
          <ul className="mt-10 space-y-3 text-sm text-navy-200">
            <li>— A1 to B2 in English, French, Spanish, German and Danish</li>
            <li>— A speaking coach that adapts to your level</li>
            <li>— Feedback that targets your recurring mistakes</li>
          </ul>
        </div>
        <p className="relative text-xs text-navy-400">Speak With Confidence.</p>
      </aside>
      <main id="main" className="flex flex-col px-4 py-8 sm:px-10">
        <div className="lg:hidden">
          <Link href="/">
            <Logo />
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}
