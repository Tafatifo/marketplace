import { cn } from "@/lib/cn";

/**
 * The Fluent Academy monogram: a geometric "F" and "A" set on a navy tile.
 * The gold crossbar of the A is the brand's single accent — a bridge between
 * what a learner knows and what they are about to say.
 */
export function LogoMark({ className, title = "Fluent Academy" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} role="img" aria-label={title}>
      <rect width="32" height="32" rx="7.5" fill="#0b1f3a" />
      <path d="M8 24V8.2h6.4M8 15.4h5" stroke="#fff" strokeWidth="2.6" strokeLinecap="square" fill="none" />
      <path d="M14.6 24 19.6 8.2 24.6 24" stroke="#fff" strokeWidth="2.6" strokeLinejoin="miter" fill="none" />
      <path d="M16.7 18.6h5.8" stroke="#c29b3f" strokeWidth="2.6" strokeLinecap="square" />
    </svg>
  );
}

export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="h-8 w-8 shrink-0" />
      <span
        className={cn(
          "font-serif text-[1.2rem] leading-none tracking-tight",
          inverted ? "text-white" : "text-navy-900",
        )}
      >
        <span className="font-semibold">Fluent</span>{" "}
        <span className={cn("font-normal", inverted ? "text-navy-200" : "text-navy-600")}>Academy</span>
      </span>
    </span>
  );
}
