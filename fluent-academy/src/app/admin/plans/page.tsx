import { PlanEditor } from "@/components/admin/forms";
import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { requireStaff } from "@/server/auth/current";
import { resolvedBillingMode } from "@/server/env";
import { getPlans } from "@/server/billing/plans";

export default async function PlansAdmin() {
  await requireStaff("ADMIN");
  const plans = await getPlans();
  const mode = resolvedBillingMode();
  return (
    <>
      <PageHeader eyebrow="Operations" title="Plans & pricing" description="Prices and limits shown on the site and enforced by the server. Changes apply immediately." />
      <Alert tone={mode === "stripe" ? "info" : "warning"} className="mb-6">
        {mode === "stripe"
          ? "Stripe charges the configured Price IDs, not the numbers typed here. When you change a price, create a new Price in Stripe and paste its ID so the site and checkout agree."
          : `Billing mode is “${mode}”. No real payments are taken until Stripe keys are configured.`}
      </Alert>
      <div className="grid gap-6 lg:grid-cols-2">
        {plans.map((p) => (
          <Card key={p.code}>
            <CardHeader title={p.name} description={`Plan code: ${p.code}`} />
            <CardBody>
              <PlanEditor plan={{ ...p, limits: p.limits as unknown as Record<string, number | boolean | null> }} />
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
