import "server-only";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { db } from "../db";

export interface PlanLimits {
  lessonsPerDay: number | null;
  conversationsPerDay: number | null;
  messagesPerConversation: number | null;
  speakingAttemptsPerDay: number | null;
  vocabularyReviewsPerDay: number | null;
  freeUnitsOnly: boolean;
  premiumReadings: boolean;
  detailedAnalytics: boolean;
  personalizedPractice: boolean;
}

export interface PlanInfo {
  code: string;
  name: string;
  description: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  currency: string;
  limits: PlanLimits;
  features: string[];
  stripePriceMonthly: string | null;
  stripePriceYearly: string | null;
}

const DEFAULT_LIMITS: PlanLimits = {
  lessonsPerDay: 3,
  conversationsPerDay: 2,
  messagesPerConversation: 12,
  speakingAttemptsPerDay: 20,
  vocabularyReviewsPerDay: 40,
  freeUnitsOnly: true,
  premiumReadings: false,
  detailedAnalytics: false,
  personalizedPractice: false,
};

function fromFile(): PlanInfo[] {
  try {
    const raw = YAML.parse(fs.readFileSync(path.resolve(process.cwd(), "content/plans.yaml"), "utf8")) as Record<string, Omit<PlanInfo, "code">>;
    return Object.entries(raw).map(([code, p]) => ({
      ...p,
      code,
      limits: { ...DEFAULT_LIMITS, ...p.limits },
      stripePriceMonthly: null,
      stripePriceYearly: null,
    }));
  } catch {
    return [];
  }
}

/** Plans from the database (editable in /admin/plans), falling back to content/plans.yaml. */
export async function getPlans(): Promise<PlanInfo[]> {
  try {
    const rows = await db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
    if (rows.length) {
      return rows.map((r) => ({
        code: r.code,
        name: r.name,
        description: r.description,
        priceMonthlyCents: r.priceMonthlyCents,
        priceYearlyCents: r.priceYearlyCents,
        currency: r.currency,
        limits: { ...DEFAULT_LIMITS, ...(r.limits as Partial<PlanLimits>) },
        features: (r.features as string[]) ?? [],
        stripePriceMonthly: r.stripePriceMonthly ?? process.env[`STRIPE_PRICE_${r.code.toUpperCase()}_MONTHLY`] ?? null,
        stripePriceYearly: r.stripePriceYearly ?? process.env[`STRIPE_PRICE_${r.code.toUpperCase()}_YEARLY`] ?? null,
      }));
    }
  } catch {
    // Database unavailable (e.g. during a static build) — use the bundled configuration.
  }
  return fromFile();
}

export async function getPlan(code: string): Promise<PlanInfo> {
  const plans = await getPlans();
  return plans.find((p) => p.code === code) ?? plans.find((p) => p.code === "free") ?? {
    code: "free",
    name: "Free",
    description: "",
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    currency: "usd",
    limits: DEFAULT_LIMITS,
    features: [],
    stripePriceMonthly: null,
    stripePriceYearly: null,
  };
}

export { formatPrice } from "@/lib/format";
