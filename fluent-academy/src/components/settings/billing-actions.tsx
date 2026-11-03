"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";

export function BillingActions({ mode, isPremium, provider, cancelAtPeriodEnd }: { mode: "stripe" | "simulation" | "disabled"; isPremium: boolean; provider: string; cancelAtPeriodEnd: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const go = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };
  const checkout = (interval: "month" | "year") =>
    go(interval, async () => {
      const r = await api<{ url: string }>("/api/billing/checkout", { body: { plan: "premium", interval } });
      window.location.href = r.url;
    });
  const portal = () =>
    go("portal", async () => {
      const r = await api<{ url: string }>("/api/billing/portal", { method: "POST" });
      window.location.href = r.url;
    });
  const simulate = (action: "subscribe" | "cancel" | "resume" | "expire", interval: "month" | "year" = "month") =>
    go(action + interval, async () => {
      await api("/api/billing/simulate", { body: { action, interval } });
      router.refresh();
    });

  if (mode === "disabled") {
    return <Alert tone="info">Online payments aren&apos;t enabled on this server yet. Your Free plan stays fully usable.</Alert>;
  }
  return (
    <div className="space-y-3">
      {mode === "simulation" && (
        <Alert tone="warning" icon={<FlaskConical className="h-4 w-4" />} title="Development billing simulator">
          No payment provider is configured, so upgrades here are simulated and no money is charged. This simulator is disabled automatically in production.
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        {!isPremium && mode === "stripe" && (
          <>
            <Button variant="gold" onClick={() => checkout("month")} loading={busy === "month"}>Upgrade — monthly</Button>
            <Button variant="primary" onClick={() => checkout("year")} loading={busy === "year"}>Upgrade — yearly</Button>
          </>
        )}
        {!isPremium && mode === "simulation" && (
          <>
            <Button variant="gold" onClick={() => simulate("subscribe", "month")} loading={busy === "subscribemonth"}>Simulate monthly upgrade</Button>
            <Button onClick={() => simulate("subscribe", "year")} loading={busy === "subscribeyear"}>Simulate yearly upgrade</Button>
          </>
        )}
        {isPremium && provider === "stripe" && <Button onClick={portal} loading={busy === "portal"}>Manage subscription</Button>}
        {isPremium && provider === "simulation" && (
          <>
            {cancelAtPeriodEnd ? (
              <Button onClick={() => simulate("resume")} loading={busy === "resumemonth"}>Resume subscription</Button>
            ) : (
              <Button variant="outline" onClick={() => simulate("cancel")} loading={busy === "cancelmonth"}>Cancel at period end</Button>
            )}
            <Button variant="ghost" onClick={() => simulate("expire")} loading={busy === "expiremonth"}>Simulate expiry</Button>
          </>
        )}
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
