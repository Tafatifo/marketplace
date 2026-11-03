"use client";

import { useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Small, dependency-free charts in the Fluent Academy style.
 * Single-series: one navy hue (no legend needed — the card title names the series),
 * hairline solid gridlines, ≤24px bars with 4px rounded data ends, hover/focus
 * tooltips, and a table view so no value is gated behind hover.
 */

const NAVY = "var(--color-navy-600)";
const NAVY_STRONG = "var(--color-navy-900)";
const GRID = "var(--color-line)";
const GOLD = "var(--color-gold-500)";

function niceMax(v: number) {
  if (v <= 0) return 10;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export interface BarDatum {
  label: string;
  sublabel?: string;
  value: number;
  highlight?: boolean;
  detail?: string;
}

export function ColumnChart({
  data,
  unit,
  goal,
  goalLabel,
  height = 180,
  title,
}: {
  data: BarDatum[];
  unit: string;
  goal?: number;
  goalLabel?: string;
  height?: number;
  title: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(goal ?? 0, ...data.map((d) => d.value)));
  const ticks = [0, max / 2, max];
  const tableId = useId();
  const plotH = height - 28;
  const peak = data.reduce((m, d, i) => (d.value > (data[m]?.value ?? -1) ? i : m), 0);

  return (
    <figure className="relative" aria-label={title}>
      <div className="relative flex" style={{ height }}>
        {/* y axis ticks */}
        <div className="relative w-8 shrink-0 text-[0.68rem] text-subtle tabular-nums" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-2 -translate-y-1/2" style={{ top: plotH - (t / max) * plotH }}>
              {t >= 1000 ? `${Math.round(t / 100) / 10}K` : t}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 h-px" style={{ top: plotH - (t / max) * plotH, background: GRID }} aria-hidden />
          ))}
          {goal !== undefined && goal > 0 && (
            <div className="absolute inset-x-0" style={{ top: plotH - (goal / max) * plotH }} aria-hidden>
              <div className="h-px w-full" style={{ background: GOLD }} />
              <span className="absolute -top-4 right-0 text-[0.68rem] font-medium text-gold-700">{goalLabel ?? `Goal ${goal}`}</span>
            </div>
          )}
          <div className="absolute inset-x-0 top-0 flex items-end justify-around gap-[2px]" style={{ height: plotH }}>
            {data.map((d, i) => {
              const h = d.value > 0 ? Math.max(3, (d.value / max) * plotH) : 0;
              return (
                <button
                  key={d.label + i}
                  type="button"
                  className="group relative flex h-full flex-1 items-end justify-center focus-visible:outline-2"
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  aria-label={`${d.label}${d.sublabel ? ` ${d.sublabel}` : ""}: ${d.value} ${unit}${d.detail ? `, ${d.detail}` : ""}`}
                >
                  {(d.highlight || i === peak) && d.value > 0 && hover !== i && (
                    <span className="absolute text-[0.68rem] font-medium text-muted tabular-nums" style={{ bottom: h + 4 }}>{d.value}</span>
                  )}
                  <span
                    className="block w-full max-w-6 rounded-t-[4px] transition-[filter] group-hover:brightness-125"
                    style={{ height: h, background: d.highlight ? NAVY_STRONG : NAVY }}
                  />
                </button>
              );
            })}
          </div>
          {hover !== null && data[hover] && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg bg-navy-950 px-2.5 py-1.5 text-xs text-white shadow-lg"
              style={{ left: `${((hover + 0.5) / data.length) * 100}%`, top: Math.max(0, plotH - (data[hover]!.value / max) * plotH - 46) }}
              role="tooltip"
            >
              <p className="font-semibold tabular-nums">{data[hover]!.value} {unit}</p>
              <p className="text-navy-200">{data[hover]!.label}{data[hover]!.sublabel ? ` · ${data[hover]!.sublabel}` : ""}{data[hover]!.detail ? ` · ${data[hover]!.detail}` : ""}</p>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 flex justify-around" aria-hidden>
            {data.map((d, i) => (
              <span key={i} className={cn("flex-1 text-center text-[0.7rem]", d.highlight ? "font-semibold text-navy-900" : "text-subtle")}>{d.label}</span>
            ))}
          </div>
        </div>
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer select-none">View as table</summary>
        <table id={tableId} className="mt-2 w-full text-left">
          <thead><tr><th className="py-1 font-medium">Day</th><th className="py-1 font-medium">{unit}</th></tr></thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i} className="border-t border-line"><td className="py-1">{d.label} {d.sublabel}</td><td className="py-1 tabular-nums">{d.value}{d.detail ? ` (${d.detail})` : ""}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export interface MeterDatum {
  label: string;
  value: number | null; // 0..1, null = no data
  detail: string;
}

/** Horizontal meters (e.g. accuracy by skill). The unfilled track is a lighter step of the same hue. */
export function MeterList({ data }: { data: MeterDatum[] }) {
  return (
    <ul className="space-y-3.5">
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-navy-900">{d.label}</span>
            <span className="text-xs text-muted tabular-nums">{d.value === null ? "No data yet" : `${Math.round(d.value * 100)}%`} · {d.detail}</span>
          </div>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-navy-50"
            role="meter"
            aria-label={d.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={d.value === null ? undefined : Math.round(d.value * 100)}
            aria-valuetext={d.value === null ? "No data yet" : `${Math.round(d.value * 100)}%, ${d.detail}`}
          >
            {d.value !== null && <div className="h-full rounded-r-[4px]" style={{ width: `${Math.max(2, d.value * 100)}%`, background: NAVY }} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface PointDatum {
  x: string; // label
  y: number; // 0..1
  detail?: string;
}

/** A single-series trend line with a crosshair tooltip that snaps to the nearest point. */
export function TrendLine({ data, height = 160, format = (v: number) => `${Math.round(v * 100)}%`, title }: { data: PointDatum[]; height?: number; format?: (v: number) => string; title: string }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = height;
  const pad = { l: 34, r: 12, t: 12, b: 22 };
  const pts = useMemo(
    () =>
      data.map((d, i) => ({
        x: pad.l + (data.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (data.length - 1)) * (W - pad.l - pad.r)),
        y: pad.t + (1 - Math.max(0, Math.min(1, d.y))) * (H - pad.t - pad.b),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, H],
  );
  if (!data.length) return null;
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${path} L${pts.at(-1)!.x},${H - pad.b} L${pts[0]!.x},${H - pad.b} Z`;
  const onMove = (e: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    pts.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs(pts[best]!.x - x)) best = i;
    });
    setHover(best);
  };
  return (
    <figure aria-label={title} className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${title}: ${data.map((d) => `${d.x} ${format(d.y)}`).join(", ")}`}>
        {[0, 0.5, 1].map((t) => {
          const y = pad.t + (1 - t) * (H - pad.t - pad.b);
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
              <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="10" fill="var(--color-subtle)">{format(t)}</text>
            </g>
          );
        })}
        <path d={area} fill={NAVY} opacity={0.1} />
        <path d={path} fill="none" stroke={NAVY} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && <line x1={pts[hover]!.x} x2={pts[hover]!.x} y1={pad.t} y2={H - pad.b} stroke="var(--color-navy-300)" strokeWidth={1} />}
        {pts.map((p, i) =>
          i === pts.length - 1 || i === hover ? (
            <circle key={i} cx={p.x} cy={p.y} r={4.5} fill={NAVY} stroke="white" strokeWidth={2} />
          ) : null,
        )}
        <text x={pts.at(-1)!.x} y={Math.max(10, pts.at(-1)!.y - 9)} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--color-ink)">{format(data.at(-1)!.y)}</text>
        <text x={pad.l} y={H - 6} fontSize="10" fill="var(--color-subtle)">{data[0]!.x}</text>
        {data.length > 1 && <text x={W - pad.r} y={H - 6} textAnchor="end" fontSize="10" fill="var(--color-subtle)">{data.at(-1)!.x}</text>}
      </svg>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-navy-950 px-2.5 py-1.5 text-xs text-white shadow-lg" style={{ left: `${(pts[hover]!.x / W) * 100}%` }} role="tooltip">
          <p className="font-semibold tabular-nums">{format(data[hover]!.y)}</p>
          <p className="text-navy-200">{data[hover]!.x}{data[hover]!.detail ? ` · ${data[hover]!.detail}` : ""}</p>
        </div>
      )}
      <details className="mt-1 text-xs text-muted">
        <summary className="cursor-pointer select-none">View as table</summary>
        <table className="mt-2 w-full text-left">
          <tbody>
            {data.map((d, i) => (
              <tr key={i} className="border-t border-line"><td className="py-1">{d.x}</td><td className="py-1 tabular-nums">{format(d.y)}</td><td className="py-1">{d.detail}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
